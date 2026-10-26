import fs from 'fs'
import path from 'path'
import plugin from '#plugin'
import setting from '#setting'
import { chat as chatApi, fetchPending } from '../api/chat/client.js'
import { append, isChatGroup, sessionId } from '../api/chat/buffer.js'
import { buildChatPayload } from '../api/chat/buildPayload.js'
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

// 模块载入即打点，确认 Yunzai 是否 import 到本文件
debugLog(`module_load pid=${process.pid}`)

/**
 * 用 Bot.on 收消息，不走 rule/accept 链。
 * Yunzai 的 onlyReplyAt / 先前插件 return / enable 白名单都可能让 accept+rule 进不去。
 */
export const Chat = plugin({
  name: '[悠悠助手]Chat',
  event: 'message',
  priority: 20000,
  func: [init],
})

let hooked = false

async function init() {
  debugLog(`init_start hooked=${hooked} hasBot=${typeof Bot !== 'undefined'}`)
  if (hooked) return
  if (typeof Bot === 'undefined' || typeof Bot.on !== 'function') {
    debugLog('init_fail no Bot.on')
    logger.error('[yoyo-chat] Bot.on 不可用，Chat 无法挂载')
    return
  }
  hooked = true
  Bot.on('message', e => {
    void handleMessage(e)
  })
  debugLog('init_ok Bot.on(message) registered')
  logger.info('[yoyo-chat] 已挂载 Bot.on(message)')
}

async function handleMessage(e) {
  try {
    const mid = String(e?.message_id || '')
    const preview = String(e?.raw_message || e?.msg || '').slice(0, 80)
    debugLog(
      `msg type=${e?.message_type} group=${e?.group_id} mid=${mid} preview=${preview}`,
    )

    if (!e?.isGroup && e?.message_type !== 'group') return
    // dealEvent 可能尚未跑完；兼容未设置 isGroup 的原始事件
    if (!e.isGroup) e.isGroup = true

    const cfg = setting.config
    if (!isChatGroup(e, cfg)) {
      debugLog(`skip not_whitelist group=${e.group_id}`)
      return
    }

    if (mid) {
      if (seenMessageIds.has(mid)) return
      seenMessageIds.add(mid)
      if (seenMessageIds.size > 500) {
        const first = seenMessageIds.values().next().value
        seenMessageIds.delete(first)
      }
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
  } catch (err) {
    logger.error(`[yoyo-chat] handle ${err.message}`)
    debugLog(`handle_err ${err.message}`)
  }
}

async function runChat(e, cfg) {
  // dealEvent 填充 atBot；若 Bot.on 早于 deal，补一次 hints 用字段
  if (e.atBot && !e.atme) e.atme = true

  const payload = buildChatPayload(e, cfg)
  const hints = payload.hints
  const active = isActiveInitiate(hints)
  debugLog(`run hints=${JSON.stringify(hints)} active=${active}`)

  if (!isChatServerRunning(cfg)) {
    debugLog('server_down')
    if (active) await e.reply('悠悠还没启动，主人可以发 #启动悠悠~')
    return
  }

  let body
  try {
    body = await chatApi(payload, cfg)
  } catch (err) {
    logger.warn(`[yoyo-chat] 请求失败: ${err.message}`)
    debugLog(`api_err ${err.message}`)
    if (active) await e.reply('刚才脑子短路了一下，稍后再找我~')
    return
  }

  const data = body?.data || {}
  debugLog(
    `resp action=${data.action} reason=${data.reason} replies=${data.replies?.length || 0}`,
  )
  const turnGen = Number(data.turn_gen) || 0
  const sid = sessionId(e)
  sessionTurnGen.set(sid, turnGen)

  const busy = Array.isArray(data.busy?.tools) && data.busy.tools.length > 0
  if (busy || data.reason === 'tool_started') {
    startPendingPoller(e, cfg, sid)
  }

  if (data.action === 'skip' || data.aborted) return
  if (!Array.isArray(data.replies) || !data.replies.length) return

  await sendReplies(e, data.replies, cfg, {
    turnGen,
    getCurrentTurnGen: () => sessionTurnGen.get(sid),
  })
}

function startPendingPoller(e, cfg, sid) {
  if (pendingPollers.has(sid)) return
  let ticks = 0
  const timer = setInterval(() => {
    void (async () => {
      ticks++
      if (ticks > 60) {
        clearInterval(timer)
        pendingPollers.delete(sid)
        return
      }
      try {
        const body = await fetchPending(sid, cfg)
        const data = body?.data
        if (!data || data.action === 'skip' || !data.replies?.length) {
          // 仍 busy 则继续；否则多空几轮后停
          if (!data?.busy?.tools?.length && ticks > 8) {
            clearInterval(timer)
            pendingPollers.delete(sid)
          }
          return
        }
        const turnGen = Number(data.turn_gen) || 0
        sessionTurnGen.set(sid, turnGen)
        debugLog(`pending_outbox replies=${data.replies.length} reason=${data.reason}`)
        await sendReplies(e, data.replies, cfg, {
          turnGen,
          getCurrentTurnGen: () => sessionTurnGen.get(sid),
        })
        if (!data.busy?.tools?.length) {
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
