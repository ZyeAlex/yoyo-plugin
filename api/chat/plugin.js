import plugin from '#plugin'
import setting from '#setting'
import { chat as chatApi } from './client.js'
import { append, isChatGroup, sessionId } from './buffer.js'
import { buildChatPayload } from './buildPayload.js'
import { isActiveInitiate } from './trigger.js'
import { sendReplies } from './reply.js'
import { isChatServerRunning } from '../../utils/chat-server.js'

/** 同群串行；记录最新 turn_gen 以丢弃过期气泡 */
const sessionQueues = new Map()
const sessionTurnGen = new Map()

export const Chat = plugin({
  name: '[悠悠助手]Chat',
  event: 'message',
  priority: 10000,
  rule: [{ reg: '.*', fnc: onMessage, log: false }],
})

async function onMessage(e) {
  const cfg = setting.config
  if (!isChatGroup(e, cfg)) return false

  await append(e, cfg)

  const sid = sessionId(e)
  const previous = sessionQueues.get(sid) || Promise.resolve()
  const current = previous
    .then(async () => {
      await runChat(e, cfg)
    })
    .catch((err) => logger.error(`[yoyo-chat] ${err.message}`))
  sessionQueues.set(sid, current)

  // 不阻断图鉴等其它插件
  return false
}

async function runChat(e, cfg) {
  const payload = buildChatPayload(e, cfg)
  const hints = payload.hints
  const active = isActiveInitiate(hints)

  if (!isChatServerRunning(cfg)) {
    if (active) await e.reply('悠悠还没启动，主人可以发 #启动悠悠~')
    return
  }

  let body
  try {
    body = await chatApi(payload, cfg)
  } catch (err) {
    logger.warn(`[yoyo-chat] 请求失败: ${err.message}`)
    if (active) await e.reply('刚才脑子短路了一下，稍后再找我~')
    return
  }

  const data = body?.data || {}
  const turnGen = Number(data.turn_gen) || 0
  sessionTurnGen.set(sessionId(e), turnGen)

  if (data.action === 'skip' || data.aborted) return
  if (!Array.isArray(data.replies) || !data.replies.length) return

  await sendReplies(e, data.replies, cfg, {
    turnGen,
    getCurrentTurnGen: () => sessionTurnGen.get(sessionId(e)),
  })
}
