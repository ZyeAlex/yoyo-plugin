import { sendReplies, sendReply } from './reply.js'

/**
 * 从 sseEvents 计算 YoAgent 处理耗时（started → reply），与 QQ 投递解耦。
 * @param {Array<{ event: string, at: number }>} sseEvents
 */
export function computeSseAgentMs(sseEvents = []) {
  const started = sseEvents.find((e) => e.event === 'started')
  const reply = sseEvents.find((e) => e.event === 'reply')
  if (!started?.at || !reply?.at) return null
  return Math.max(0, reply.at - started.at)
}

/**
 * SSE onEvent：只收集 reply/status，不在回调里 await QQ 投递（避免阻塞读 done）。
 */
export function createSseCollectHandler() {
  let queued = false
  let statusContent = null
  let replyData = null
  const sseEvents = []

  const handler = async (event, data) => {
    sseEvents.push({ event, at: Date.now() })
    if (event === 'queued' && data?.queued) {
      queued = true
      return
    }
    if (event === 'started') return
    if (event === 'status' && data?.content) {
      statusContent = data.content
      return
    }
    if (event === 'reply') {
      replyData = data
      return
    }
    if (event === 'error') {
      const err = new Error(data?.message || 'Agent 返回错误')
      err.code = data?.code ?? 1
      err.serverAgentError = true
      throw err
    }
  }

  return {
    handler,
    getState: () => ({ queued, statusContent, replyData, sseEvents }),
  }
}

/** 流结束后投递 status + reply 到 QQ */
export async function deliverCollectedStream(e, state, cfg, replyTarget, { sendRepliesFn = sendReplies } = {}) {
  const { statusContent, replyData } = state
  let sent = false
  let startedSent = false
  let deliveryVia = null

  if (statusContent) {
    const statusReply = await sendReply(
      e,
      { message: [{ type: 'text', data: { text: statusContent } }] },
      replyTarget,
    )
    if (statusReply.sent) startedSent = true
  }
  if (replyData) {
    const delivery = await sendRepliesFn(e, replyData, cfg, replyTarget)
    sent = delivery.sent
    deliveryVia = delivery.via
  }

  return { sent, startedSent, deliveryVia, replyData }
}

/**
 * @deprecated 旧行为：在 reply 回调内 await sendReplies，会阻塞 SSE 读 done。
 * 仅用于回归测试对比。
 */
export async function collectStreamLegacyBlocking(
  e,
  payload,
  chatStream,
  cfg,
  replyTarget,
  { sendRepliesFn = sendReplies } = {},
) {
  let sent = false
  let startedSent = false
  const sseEvents = []
  await chatStream(
    payload,
    async (event, data) => {
      sseEvents.push({ event, at: Date.now() })
      if (event === 'started') return
      if (event === 'status' && data?.content) {
        await e.reply(data.content)
        startedSent = true
        return
      }
      if (event === 'reply') {
        const delivery = await sendRepliesFn(e, data, cfg, replyTarget)
        sent = delivery.sent
      }
    },
    cfg,
  )
  return { sent, startedSent, sseEvents }
}
