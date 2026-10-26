import { getChatBaseURL } from './schema.js'
import { isChatServerRunning } from '../../utils/chat-server.js'

export async function chat(payload, cfg = {}) {
  if (!isChatServerRunning(cfg)) {
    const err = new Error('Chat Brain 未运行')
    err.code = 'not_running'
    throw err
  }
  const base = getChatBaseURL(cfg)
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body?.message || `HTTP ${res.status}`)
    err.code = res.status
    err.response = body
    throw err
  }
  if (body.code !== 0) {
    const err = new Error(body?.message || 'Chat 返回错误')
    err.code = body.code
    err.response = body
    throw err
  }
  return body
}

export async function health(cfg = {}) {
  const base = getChatBaseURL(cfg)
  const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(3000) })
  if (!res.ok) throw new Error(`health ${res.status}`)
  return res.json()
}

/** 拉取异步主线气泡（tool_done 等） */
export async function fetchPending(sessionId, cfg = {}) {
  if (!isChatServerRunning(cfg)) return null
  const base = getChatBaseURL(cfg)
  const url = `${base}/api/chat/pending?session_id=${encodeURIComponent(sessionId)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.code !== 0) return null
  return body
}
