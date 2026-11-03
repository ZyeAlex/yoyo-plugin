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

/**
 * 唤醒词：避免「寒悠悠图片」嵌套误触。
 * 规则：命中处左边若是汉字，视为更长角色名的一部分；「悠悠在吗」左边为空，算唤醒。
 */
export function hasWakeWord(text, wakeWords = []) {
  const raw = String(text || '').replace(/\[CQ:[^\]]+\]/gi, ' ')
  if (!raw.trim()) return false
  const list = Array.isArray(wakeWords) ? wakeWords : []
  const isHan = (c) => /[\u4e00-\u9fff]/.test(c)
  const isAlnum = (c) => /[A-Za-z0-9]/.test(c)
  for (const w of list) {
    const word = String(w || '').trim()
    if (!word) continue
    let idx = 0
    while ((idx = raw.indexOf(word, idx)) !== -1) {
      const before = idx > 0 ? raw[idx - 1] : ''
      const after = raw[idx + word.length] || ''
      // 嵌在「寒悠悠」里 / 贴着英文数字 → 不算
      if (isHan(before) || isAlnum(before) || isAlnum(after)) {
        idx += word.length
        continue
      }
      return true
    }
  }
  return false
}

export function replyToBot(e) {
  const reply = e?.source || e?.reply || null
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
  const wakeWords = cfg.chatWakeWords || ['悠悠', '小悠']
  // 用去掉 CQ 后的可读文本，减少 raw 噪声
  const text = String(e.msg || e.raw_message || '')
  return {
    at_bot: messageAtBot(e) || Boolean(e.atme),
    wake_word: hasWakeWord(text, wakeWords),
    reply_to_bot: replyToBot(e),
  }
}

export function isActiveInitiate(hints = {}) {
  return Boolean(hints.at_bot || hints.wake_word || hints.reply_to_bot)
}
