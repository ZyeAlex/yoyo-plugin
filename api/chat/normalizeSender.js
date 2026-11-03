/** 稳定化 Yunzai sender：QQ / 身份 / 昵称。 */

const ROLES = new Set(['owner', 'admin', 'member'])

/**
 * @param {any} e Yunzai 事件
 * @returns {{ user_id: string, nickname: string, card: string, display: string, role: 'owner'|'admin'|'member' } & Record<string, any>}
 */
export function normalizeSender(e) {
  const raw = e?.sender && typeof e.sender === 'object' ? { ...e.sender } : {}
  const userId = String(e?.user_id || raw.user_id || '').trim()
  const nickname = String(raw.nickname || '').trim()
  const card = String(raw.card || '').trim()
  const display = card || nickname || userId
  let role = String(raw.role || '').toLowerCase()
  if (!ROLES.has(role)) role = 'member'
  return {
    ...raw,
    user_id: userId,
    nickname,
    card,
    display,
    role,
  }
}

export function botNicknameFromCfg(cfg = {}) {
  const words = cfg.chatWakeWords || cfg.wakeWords
  if (Array.isArray(words) && words.length) {
    const first = String(words[0] || '').trim()
    if (first) return first
  }
  return '悠悠'
}
