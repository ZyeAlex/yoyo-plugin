/** 从 Yunzai 事件提取 hints */

export function messageAtBot(e) {
  if (e?.atme || e?.atBot) return true
  const self = String(e?.self_id || '')
  if (!self) return false
  if (Array.isArray(e?.message)) {
    const hit = e.message.some((seg) => {
      if (!seg || seg.type !== 'at') return false
      const qq = String(seg.qq ?? seg.data?.qq ?? '')
      return qq === self
    })
    if (hit) return true
  }
  // OneBot CQ 码兜底：raw_message 含 [CQ:at,qq=bot]
  const raw = String(e?.raw_message || e?.msg || '')
  if (raw.includes(`[CQ:at,qq=${self}]`) || raw.includes(`qq=${self}`)) return true
  return false
}

export function hasWakeWord(text, wakeWords = []) {
  const raw = String(text || '')
  if (!raw) return false
  const list = Array.isArray(wakeWords) ? wakeWords : []
  return list.some((w) => w && raw.includes(String(w)))
}

export function replyToBot(e) {
  const reply = e?.source || e?.reply || null
  // Yunzai 各适配器字段不一：常见 reply 段或 getReply
  if (Array.isArray(e?.message)) {
    const hasReplySeg = e.message.some((seg) => seg?.type === 'reply')
    if (hasReplySeg && e.atme) return true
  }
  if (reply && String(reply.user_id || reply.sender?.user_id || '') === String(e.self_id || '')) {
    return true
  }
  return false
}

export function buildHints(e, cfg = {}) {
  const wakeWords = cfg.chatWakeWords || cfg.agentWakeWords || ['悠悠', '小悠']
  const text = e.raw_message || e.msg || ''
  return {
    at_bot: messageAtBot(e) || Boolean(e.atme),
    wake_word: hasWakeWord(text, wakeWords),
    reply_to_bot: replyToBot(e),
  }
}

export function isActiveInitiate(hints = {}) {
  return Boolean(hints.at_bot || hints.wake_word || hints.reply_to_bot)
}
