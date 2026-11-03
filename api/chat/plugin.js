import fs from 'fs'
import path from 'path'
import plugin from '#plugin'
import setting from '#setting'
import { chat as chatApi, fetchPending, ingestMedia } from '../api/chat/client.js'
import { append, isChatGroup, sessionId } from '../api/chat/buffer.js'
import { buildChatPayload } from '../api/chat/buildPayload.js'
import { expandForwardInPlace } from '../api/chat/expandForward.js'
import { isActiveInitiate } from '../api/chat/trigger.js'
import { sendReplies } from '../api/chat/reply.js'
import { isChatServerRunning } from '../utils/chat-server.js'

/** 同群串行；记录最新 turn_gen 以丢弃过期气泡 */
const sessionQueues = new Map()
const sessionTurnGen = new Map()
const seenMessageIds = new Set()
/** session_id → 正在轮询 outbox 的定时器 */
const pendingPollers = new Map()

const DEBUG_LOG = path.join(setting.path, 'server', 'chat-plugin.debug.log')

function debugLog(line) {
  try {
    fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${line}\n`)
  } catch {}
}

debugLog(`module_load pid=${process.pid}`)

/**
 * 走 Yunzai 标准 rule 链（不要 Bot.on）。
 * priority 很大：签到/图片/图鉴等先匹配并处理后 loader 直接 return，本插件收不到。
 * 未被其它插件认领的群消息才落到这里 → 闲聊脑。
 * 非白名单群 return false，把机会让给更后面的插件。
 */
export const Chat = plugin({
  name: '[悠悠助手]Chat',
  event: 'message.group',
  priority: 50000,
  rule: [
    {
      // 兜底：任意群消息；真正过滤在 onGroupMessage
      reg: /[\s\S]*/,
      fnc: onGroupMessage,
      log: false,
    },
  ],
})

async function onGroupMessage(e) {
  try {
    const mid = String(e?.message_id || '')
    const preview = String(e?.raw_message || e?.msg || '').slice(0, 80)
    debugLog(
      `msg type=${e?.message_type} group=${e?.group_id} name=${e?.group_name || ''} mid=${mid} preview=${preview}`,
    )

    if (!e?.isGroup && e?.message_type !== 'group') return false
    if (!e.isGroup) e.isGroup = true

    const cfg = setting.config
    if (!isChatGroup(e, cfg)) {
      debugLog(`skip not_whitelist group=${e.group_id}`)
      return false
    }

    if (mid) {
      if (seenMessageIds.has(mid)) return true
      seenMessageIds.add(mid)
      if (seenMessageIds.size > 500) {
        const first = seenMessageIds.values().next().value
        seenMessageIds.delete(first)
      }
    }

    // 合并转发只有 id：先拉平正文，再进 buffer / 主线，否则人设只看见 CQ:forward
    try {
      await expandForwardInPlace(e)
    } catch (err) {
      debugLog(`forward_expand_err ${err?.message || err}`)
    }

    await append(e, cfg)

    const sid = sessionId(e)
    const previous = sessionQueues.get(sid) || Promise.resolve()
    const current = previous
      .then(async () => {
        await runChat(e, cfg)
      })
      .catch(err => {
        logger.error(`[yoyo-chat] ${err.message}`)
        debugLog(`queue_err ${err.message}`)
      })
    sessionQueues.set(sid, current)
    // 已接手：return true 吃掉这条，后面的插件不再处理。模型失败只在 runChat 里静默。
    return true
  } catch (err) {
    logger.error(`[yoyo-chat] handle ${err.message}`)
    debugLog(`handle_err ${err.message}`)
    return false
  }
}

async function runChat(e, cfg) {
  if (e.atBot && !e.atme) e.atme = true

  const payload = buildChatPayload(e, cfg)
  const hints = payload.hints
  const active = isActiveInitiate(hints)
  debugLog(`run hints=${JSON.stringify(hints)} active=${active}`)

  if (!isChatServerRunning(cfg)) {
    debugLog('server_down')
    if (active) return
  }

  const ingestPayload = {
    group_id: String(payload.session?.group_id || e.group_id || ''),
    message: payload.message,
  }
  void ingestMedia(ingestPayload, cfg).catch(err => {
    debugLog(`ingest_err ${err.message}`)
  })

  let body
  try {
    body = await chatApi(payload, cfg)
  } catch (err) {
    logger.warn(`[yoyo-chat] 请求失败: ${err.message}`)
    debugLog(`api_err ${err.message}`)
    if (active)   return
  }

  const data = body?.data || {}
  debugLog(
    `resp action=${data.action} reason=${data.reason} replies=${data.replies?.length || 0}`,
  )
  const turnGen = Number(data.turn_gen) || 0
  const sid = sessionId(e)
  sessionTurnGen.set(sid, turnGen)

  const busy = Array.isArray(data.busy?.tools) && data.busy.tools.length > 0
  if (
    busy ||
    data.reason === 'tool_started' ||
    data.reason === 'hold' ||
    data.reason === 'tool_running_listen'
  ) {
    startPendingPoller(e, cfg, sid, { fromHold: data.reason === 'hold' })
  }

  if (data.action === 'skip' || data.aborted) return
  if (!Array.isArray(data.replies) || !data.replies.length) return

  await sendReplies(e, data.replies, cfg, {
    turnGen,
    getCurrentTurnGen: () => sessionTurnGen.get(sid),
  })
}

function startPendingPoller(e, cfg, sid, opts = {}) {
  if (pendingPollers.has(sid)) return
  let ticks = 0
  let emptyAfterClear = 0
  let sawBusy = false
  const fromHold = !!opts.fromHold
  const timer = setInterval(() => {
    void (async () => {
      ticks++
      if (ticks > 120) {
        clearInterval(timer)
        pendingPollers.delete(sid)
        return
      }
      try {
        const body = await fetchPending(sid, cfg)
        const data = body?.data
        const stillBusy = Array.isArray(data?.busy?.tools) && data.busy.tools.length > 0
        if (stillBusy) {
          sawBusy = true
          emptyAfterClear = 0
        }
        if (!data || data.action === 'skip' || !data.replies?.length) {
          if (!stillBusy) {
            emptyAfterClear++
            const limit = sawBusy ? 25 : fromHold ? 50 : 8
            if (emptyAfterClear > limit) {
              clearInterval(timer)
              pendingPollers.delete(sid)
            }
          }
          return
        }
        emptyAfterClear = 0
        const turnGen = Number(data.turn_gen) || 0
        sessionTurnGen.set(sid, turnGen)
        debugLog(`pending_outbox replies=${data.replies.length} reason=${data.reason}`)
        await sendReplies(e, data.replies, cfg, {
          turnGen,
          getCurrentTurnGen: () => sessionTurnGen.get(sid),
        })
        if (!stillBusy) {
          clearInterval(timer)
          pendingPollers.delete(sid)
        }
      } catch (err) {
        debugLog(`pending_err ${err.message}`)
      }
    })()
  }, 1500)
  pendingPollers.set(sid, timer)
}
