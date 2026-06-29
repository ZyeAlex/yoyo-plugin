/** Agent 触发：@ 机器人 或 唤醒词（agentWakeWords） */

const DEFAULT_WAKE_WORDS = ['悠悠', '小悠']

/** 句尾唤醒词后允许的标点（。、？等） */
const TRAILING_PUNCT = "[。，？！!?…~～、；：；\"\"''（）()【】\\[\\]«».,!?;:~]+"

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 构建唤醒词正则：^(悠悠|小悠) 或 (悠悠|小悠)(标点)$ */
function buildWakeWordPattern(wakeWords) {
  const words = (wakeWords || DEFAULT_WAKE_WORDS).map(escapeRegExp).filter(Boolean)
  if (!words.length) return null
  const alt = words.join('|')
  return new RegExp(`^(?:${alt})|(?:${alt})${TRAILING_PUNCT}$`)
}

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

/**
 * 与 server onebot.has_wake_word 一致：
 * 1. 句首唤醒词 ^(悠悠|小悠)
 * 2. 句尾唤醒词+标点 (悠悠|小悠)[。，？！…]+$
 */
export function hasWakeWord(text, wakeWords) {
  const t = String(text || '').trim()
  if (!t) return false
  const pattern = buildWakeWordPattern(wakeWords?.length ? wakeWords : DEFAULT_WAKE_WORDS)
  return pattern ? pattern.test(t) : false
}

/** 从消息段解析 @ 机器人的 qq（兼容 data.qq） */
export function messageAtBot(e, botId) {
  const bid = String(botId ?? e?.self_id ?? '')
  if (!bid) return false
  for (const seg of e?.message || []) {
    if (seg?.type !== 'at') continue
    const data = seg.data && typeof seg.data === 'object' ? seg.data : {}
    const qq = String(seg.qq ?? data.qq ?? seg.user_id ?? '')
    if (qq === bid) return true
  }
  return false
}

/** 是否应触发 Agent（agentIsAt=false 时每条消息都触发） */
export function shouldTriggerAgent(e, cfg = {}) {
  if (cfg.agentIsAt === false) return true
  if (e?.atBot || messageAtBot(e)) return true
  return hasWakeWord(messagePlainText(e), getWakeWords(cfg))
}
