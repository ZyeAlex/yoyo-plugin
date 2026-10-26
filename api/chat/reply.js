function delayRange(cfg) {
  const min = Number(cfg.chatReplyDelayMinMs ?? 500)
  const max = Number(cfg.chatReplyDelayMaxMs ?? 2000)
  const a = Number.isFinite(min) ? min : 500
  const b = Number.isFinite(max) ? max : 2000
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return lo + Math.floor(Math.random() * (hi - lo + 1))
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * @param {object} e
 * @param {Array} replies
 * @param {object} opts
 * @param {number} opts.turnGen
 * @param {() => number} opts.getCurrentTurnGen  若代次已变则停止发送
 */
export async function sendReplies(e, replies, cfg = {}, opts = {}) {
  const list = Array.isArray(replies) ? replies : []
  let sent = 0
  for (let i = 0; i < list.length; i++) {
    if (typeof opts.getCurrentTurnGen === 'function' && opts.turnGen != null) {
      if (opts.getCurrentTurnGen() !== opts.turnGen) {
        return { sent, aborted: true }
      }
    }
    const bubble = list[i]
    if (!bubble) continue
    if (bubble.type === 'image' && bubble.path) {
      try {
        await e.reply(segment.image(bubble.path))
        sent++
      } catch (err) {
        logger.warn(`[yoyo-chat] 发图失败: ${err.message}`)
      }
    } else {
      const text = String(bubble.text || '').trim()
      if (!text) continue
      try {
        await e.reply(text)
        sent++
      } catch (err) {
        logger.warn(`[yoyo-chat] 发送失败: ${err.message}`)
      }
    }
    if (i < list.length - 1) {
      await sleep(delayRange(cfg))
    }
  }
  return { sent, aborted: false }
}
