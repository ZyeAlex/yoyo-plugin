import plugin from '#plugin'
import setting from '#setting'
import agentClient from '../api/agent/client.js'
import { append, isAgentGroup, sessionId, take } from '../api/agent/buffer.js'
import { buildAgentPayload } from '../api/agent/buildPayload.js'
import { appendAgentIoLog, buildIoLogRecord } from '../api/agent/ioLog.js'
import { sendReplies, sleep } from '../api/agent/reply.js'
import { shouldTriggerAgent } from '../api/agent/trigger.js'
import { userReplyForFailure, isServerAgentError } from '../api/agent/userReply.js'

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

function agentTimeoutMs(cfg = setting.config) {
  const pluginSec = Number(cfg.agentTimeout) || 60
  const llmSec = Number(cfg.agentLlmTimeoutSec) || 60
  const steps = Number(cfg.agentMaxSteps) || 4
  const estimatedSec = (steps + 2) * llmSec
  return Math.max(pluginSec, estimatedSec) * 1000
}

/** SSE 断流后同步回退：等同群 run 仍占用 session 时轮询等待，避免 queued 静默无回复 */
async function chatWhenReady(payload, cfg = setting.config) {
  const deadline = Date.now() + agentTimeoutMs(cfg)
  let lastQueued = false
  while (Date.now() < deadline) {
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

function logIo(payload, startedAt, meta) {
  appendAgentIoLog(
    buildIoLogRecord(payload, {
      duration_ms: Date.now() - startedAt,
      ...meta,
    }),
  )
}

async function chat(e) {
  const cfg = setting.config
  if (!isAgentGroup(e, cfg)) return false

  await append(e, cfg)

  if (!shouldTrigger(e, cfg)) return false

  runAgent(e).catch((err) => logger.error(`[yoyo-agent] ${err.message}`))
  return true
}

async function runAgentStream(e, payload, cfg) {
  let sent = false
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
        sent = await sendReplies(e, data, cfg)
        responseMeta = { ok: true, stream: true, queued, sent, startedSent, sseEvents, reply: data }
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
  return { sent, queued, startedSent, responseMeta }
}

async function runAgent(e) {
  const messages = take(sessionId(e))
  if (!messages.length) return

  const cfg = setting.config
  const payload = buildAgentPayload(e, messages)
  const startedAt = Date.now()

  let sent = false
  let queued = false
  let startedSent = false
  let responseMeta = null
  let failureError = null
  let syncCode = 0
  let syncMessage = ''

  try {
    if (useAgentStream(cfg)) {
      try {
        const streamResult = await runAgentStream(e, payload, cfg)
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
          if (res.code !== 0) {
            failureError = new Error(syncMessage || 'Agent 返回错误')
          } else {
            sent = await sendReplies(e, res.data, cfg)
          }
          responseMeta = {
            ok: res?.code === 0,
            stream: false,
            fallback: true,
            startedSent,
            response: { code: res?.code, message: res?.message, data: res?.data },
          }
        }
      }
    } else {
      const res = await agentClient.chat(payload)
      syncCode = res?.code
      syncMessage = res?.message || ''
      if (res.queued) {
        queued = true
      } else if (res.code !== 0) {
        failureError = new Error(syncMessage || 'Agent 返回错误')
      } else {
        sent = await sendReplies(e, res.data, cfg)
        responseMeta = {
          ok: true,
          stream: false,
          response: { code: res?.code, message: res?.message, data: res?.data },
        }
      }
    }

    if (queued) {
      logIo(payload, startedAt, { ok: true, queued: true, startedSent })
      if (!sent) {
        await e.reply('上一条还在处理中，稍等我一下~')
      }
      return
    }

    logIo(payload, startedAt, responseMeta || { ok: true, sent })

    const fallback = userReplyForFailure({
      error: failureError,
      startedSent,
      sent,
      syncCode,
      syncMessage,
    })
    if (fallback) {
      await e.reply(fallback)
    }
  } catch (err) {
    logIo(payload, startedAt, {
      ok: false,
      error: err.message,
      response: err.response || null,
    })
    logger.error(`[yoyo-agent] ${err.message}`)
    const fallback =
      userReplyForFailure({ error: err, startedSent, sent }) || '刚才查资料出了点问题，稍后再试~'
    await e.reply(fallback)
  }
}
