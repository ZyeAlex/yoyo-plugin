/** Agent 触发：@ 机器人 或 唤醒词（悠悠 / 小悠） */

const DEFAULT_WAKE_WORDS = ['悠悠', '小悠']

export function getWakeWords(cfg = {}) {
  const list = cfg.agentWakeWords
  if (Array.isArray(list) && list.length) {
    return list.map((w) => String(w).trim()).filter(Boolean)
  }
  return [...DEFAULT_WAKE_WORDS]
}

/** 从消息段或 raw_message 提取纯文本（用于唤醒词匹配） */
export function messagePlainText(e) {
  const segs = e?.message
  if (Array.isArray(segs)) {
    const text = segs
      .filter((s) => s?.type === 'text')
      .map((s) => s.text ?? '')
      .join('')
      .trim()
    if (text) return text
  }
  const raw = String(e?.raw_message || '')
  if (!raw) return ''
  return raw.replace(/\[CQ:[^\]]*\]/g, '').trim()
}

/** 与 server onebot.has_wake_word 一致：消息含任一唤醒词即触发 */
export function hasWakeWord(text, wakeWords) {
  const t = String(text || '').trim()
  if (!t) return false
  const words = wakeWords?.length ? wakeWords : DEFAULT_WAKE_WORDS
  return words.some((w) => w && t.includes(w))
}

/** 是否应触发 Agent（agentIsAt=false 时每条消息都触发） */
export function shouldTriggerAgent(e, cfg = {}) {
  if (cfg.agentIsAt === false) return true
  if (e?.atBot) return true
  return hasWakeWord(messagePlainText(e), getWakeWords(cfg))
}
