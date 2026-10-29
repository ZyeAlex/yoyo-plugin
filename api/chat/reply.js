const CQ_AT = /\[CQ:at,qq=(\d+)(?:,name=([^,\]]*))?[^\]]*\]/gi
const CQ_ANY = /\[CQ:[^\]]+\]/g
const QQ_ID = /^\d{5,14}$/

/** 只允许纯数字 QQ；昵称/@空气一律丢掉。 */
export function normalizeMention(mention) {
  const raw = mention == null ? '' : String(mention).trim()
  if (!raw) return ''
  if (QQ_ID.test(raw)) return raw
  const m = raw.match(/(\d{5,14})/)
  if (m && /^(?:qq[:：\s@]*)?\d{5,14}$/i.test(raw)) return m[1]
  return ''
}

/** 正文里的 CQ @ 抽成真正的 segment.at，其余 CQ 丢掉。 */
export function outgoingPayload(bubble) {
  let text = String(bubble?.text || '')
  let mention = normalizeMention(bubble?.mention)
  text = text.replace(CQ_AT, (_, qq) => {
    if (!mention && QQ_ID.test(String(qq))) mention = String(qq)
    return ''
  })
  text = text.replace(CQ_ANY, '')
  text = text.replace(/[ \t]{2,}/g, ' ').trim()
  mention = normalizeMention(mention)
  if (mention && typeof segment !== 'undefined' && typeof segment.at === 'function') {
    const at = segment.at(mention)
    if (!text) return at
    return [at, ` ${text}`]
  }
  return text
}

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
    } else if (bubble.type === 'record' && bubble.path) {
      try {
        if (typeof segment !== 'undefined' && typeof segment.record === 'function') {
          await e.reply(segment.record(bubble.path))
        } else {
          await e.reply({ type: 'record', file: bubble.path })
        }
        sent++
      } catch (err) {
        logger.warn(`[yoyo-chat] 发语音失败: ${err.message}`)
      }
    } else {
      const payload = outgoingPayload(bubble)
      if (!payload) continue
      try {
        await e.reply(payload)
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
