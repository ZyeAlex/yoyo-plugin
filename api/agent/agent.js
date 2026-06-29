import plugin from '#plugin'
import setting from '#setting'
import agentClient from '../api/agent/client.js'
import { append, isAgentGroup, sessionId, take } from '../api/agent/buffer.js'
import { buildAgentPayload } from '../api/agent/buildPayload.js'
import { logAbortedTurn, logBotOut, logUserIn } from '../api/agent/ioLog.js'
import { captureReplyTarget, sendReplies, sleep } from '../api/agent/reply.js'
import { shouldTriggerAgent } from '../api/agent/trigger.js'
import { userReplyForFailure, isServerAgentError } from '../api/agent/userReply.js'

/** 同群串行处理，避免并发 runAgent 互相抢 e.reply 导致消息丢失 */
const sessionQueues = new Map()

export const Agent = plugin({
  name: '[悠悠助手]Agent',
  event: 'message',
  priority: 10000,
  rule: [{ reg: '.*', fnc: chat, log: false }],
})

function shouldTrigger(e, cfg) {
  return shouldTriggerAgent(e, cfg)
}

function useAgentStream(cfg) {
  return cfg.agentStreamEnabled !== false
}

/** SSE 断流后同步回退：等同群 run 仍占用 session 时轮询等待 */
async function chatWhenReady(payload, cfg = setting.config) {
  let lastQueued = false
  for (let i = 0; i < 120; i++) {
    const res = await agentClient.chat(payload, cfg)
    if (!res.queued) return res
    lastQueued = true
    await sleep(800)
  }
  if (lastQueued) {
    const err = new Error('Agent 仍在处理上一条请求')
    err.code = 'busy'
    throw err
  }
  throw new Error('Agent 请求超时')
}

async function chat(e) {
  const cfg = setting.config
  if (!isAgentGroup(e, cfg)) return false

  await append(e, cfg)

  if (!shouldTrigger(e, cfg)) return false

  const sid = sessionId(e)

  const previous = sessionQueues.get(sid) || Promise.resolve()
  const current = previous.then(async () => {
    await runAgent(e)
  }).catch((err) => logger.error(`[yoyo-agent] ${err.message}`))
  sessionQueues.set(sid, current)
  return true
}

async function deliverReplies(e, data, cfg, replyTarget) {
  const delivery = await sendReplies(e, data, cfg, replyTarget)
  return { sent: delivery.sent, delivery_via: delivery.via }
}

async function runAgentStream(e, payload, cfg, replyTarget) {
  let sent = false
  let deliveryVia = null
  let queued = false
  let startedSent = false
  let responseMeta = null
  const sseEvents = []
  await agentClient.chatStream(
    payload,
    async (event, data) => {
      sseEvents.push({ event, at: Date.now() })
      if (event === 'queued' && data?.queued) {
        queued = true
        return
      }
      if (event === 'started') {
        return
      }
      if (event === 'status' && data?.content) {
        await e.reply(data.content)
        startedSent = true
        return
      }
      if (event === 'reply') {
        const delivery = await sendReplies(e, data, cfg, replyTarget)
        sent = delivery.sent
        deliveryVia = delivery.via
        responseMeta = { ok: true, stream: true, queued, sent, startedSent, sseEvents, reply: data, delivery_via: deliveryVia }
        return
      }
      if (event === 'error') {
        const err = new Error(data?.message || 'Agent 返回错误')
        err.code = data?.code ?? 1
        err.serverAgentError = true
        throw err
      }
    },
    cfg,
  )

  if (queued && !sent) {
    const res = await chatWhenReady(payload, cfg)
    if (res.code !== 0) {
      const err = new Error(res?.message || 'Agent 返回错误')
      err.code = res?.code ?? 1
      throw err
    }
    const { sent: retrySent, delivery_via } = await deliverReplies(e, res.data, cfg, replyTarget)
    sent = retrySent
    responseMeta = {
      ok: true,
      stream: false,
      queued_retry: true,
      sent,
      startedSent,
      sseEvents,
      reply: res.data,
      delivery_via,
    }
  }

  return { sent, queued, startedSent, responseMeta }
}

async function runAgent(e) {
  const taken = take(sessionId(e))
  const messages = taken.batch || []
  if (!messages.length) {
    logAbortedTurn(e, 'empty_buffer')
    return
  }

  const cfg = setting.config
  const payload = buildAgentPayload(e, taken)
  const replyTarget = captureReplyTarget(e)
  logUserIn(payload)
  const startedAt = Date.now()

  let sent = false
  let queued = false
  let startedSent = false
  let responseMeta = null
  let failureError = null
  let syncCode = 0
  let syncMessage = ''
  let fallbackText = null
  let botMeta = { ok: false, sent: false }

  try {
    if (useAgentStream(cfg)) {
      try {
        const streamResult = await runAgentStream(e, payload, cfg, replyTarget)
        sent = streamResult.sent
        queued = streamResult.queued
        startedSent = streamResult.startedSent
        responseMeta = streamResult.responseMeta || { ok: true, stream: true, queued, sent, startedSent }
      } catch (streamErr) {
        failureError = streamErr
        if (isServerAgentError(streamErr)) {
          logger.warn(`[yoyo-agent] SSE 服务端失败: ${streamErr.message}`)
        } else {
          logger.warn(`[yoyo-agent] SSE 断流，回退同步: ${streamErr.message}`)
          const res = await chatWhenReady(payload, cfg)
          syncCode = res?.code
          syncMessage = res?.message || ''
          let deliveryVia = null
          if (res.code !== 0) {
            failureError = new Error(syncMessage || 'Agent 返回错误')
          } else {
            const d = await deliverReplies(e, res.data, cfg, replyTarget)
            sent = d.sent
            deliveryVia = d.delivery_via
          }
          responseMeta = {
            ok: res?.code === 0,
            stream: false,
            fallback: true,
            startedSent,
            response: { code: res?.code, message: res?.message, data: res?.data },
            reply: res?.data,
            delivery_via: deliveryVia,
          }
        }
      }
    } else {
      const res = await agentClient.chat(payload)
      syncCode = res?.code
      syncMessage = res?.message || ''
      if (res.queued) {
        const retried = await chatWhenReady(payload, cfg)
        syncCode = retried?.code
        syncMessage = retried?.message || ''
        if (retried.code !== 0) {
          failureError = new Error(syncMessage || 'Agent 返回错误')
        } else {
          const d = await deliverReplies(e, retried.data, cfg, replyTarget)
          sent = d.sent
          responseMeta = {
            ok: true,
            stream: false,
            queued_retry: true,
            response: { code: retried?.code, message: retried?.message, data: retried?.data },
            reply: retried?.data,
            delivery_via: d.delivery_via,
          }
        }
        if (!responseMeta) {
          responseMeta = {
            ok: retried?.code === 0,
            stream: false,
            queued_retry: true,
            response: { code: retried?.code, message: retried?.message, data: retried?.data },
            reply: retried?.data,
          }
        }
      } else if (res.code !== 0) {
        failureError = new Error(syncMessage || 'Agent 返回错误')
      } else {
        const d = await deliverReplies(e, res.data, cfg, replyTarget)
        sent = d.sent
        responseMeta = {
          ok: true,
          stream: false,
          response: { code: res?.code, message: res?.message, data: res?.data },
          reply: res?.data,
          delivery_via: d.delivery_via,
        }
      }
    }

    botMeta = {
      ok: failureError ? false : (responseMeta?.ok ?? true),
      sent,
      startedSent,
      stream: responseMeta?.stream,
      queued: responseMeta?.queued ?? false,
      fallback_sync: responseMeta?.fallback,
      sseEvents: responseMeta?.sseEvents,
      reply: responseMeta?.reply ?? null,
      delivery_via: responseMeta?.delivery_via ?? null,
      error: failureError?.message || null,
      sync_code: syncCode || null,
      sync_message: syncMessage || null,
    }

    const fallback = userReplyForFailure({
      error: failureError,
      startedSent,
      sent,
      syncCode,
      syncMessage,
    })
    if (fallback) {
      fallbackText = fallback
      botMeta.fallback_text = fallback
      await e.reply(fallback)
    }
  } catch (err) {
    botMeta = {
      ok: false,
      sent,
      startedSent,
      error: err.message,
      response: err.response || null,
    }
    logger.error(`[yoyo-agent] ${err.message}`)
    const fallback =
      userReplyForFailure({ error: err, startedSent, sent }) || '刚才查资料出了点问题，稍后再试~'
    fallbackText = fallback
    botMeta.fallback_text = fallback
    await e.reply(fallback)
  } finally {
    if (
      !fallbackText &&
      !sent &&
      !queued &&
      botMeta.ok !== false &&
      !botMeta.error &&
      !botMeta.fallback_text
    ) {
      botMeta.note = 'agent_finished_without_qq_reply'
    }
    logBotOut(payload, startedAt, botMeta)
  }
}
