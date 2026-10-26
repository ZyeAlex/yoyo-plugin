/** Chat Brain 路径与端口 */

export const DEFAULT_CHAT_PORT = 8787

export function getChatPort(cfg = {}) {
  const n = Number(cfg.chatPort ?? cfg.agentPort)
  if (Number.isFinite(n) && n > 0) return Math.floor(n)
  return DEFAULT_CHAT_PORT
}

export function getChatBaseURL(cfg = {}) {
  return `http://127.0.0.1:${getChatPort(cfg)}`
}
