import { isChatServerRunning } from '../../utils/chat-server.js'

/** 群会话近期消息（进程内） */
const recentRings = new Map()

export function sessionId(e) {
  return `group:${e.group_id}:bot:${e.self_id}`
}

export function isChatGroup(e, cfg = {}) {
  if (!e.isGroup || !e.group_id) return false
  if (cfg.chatEnabled === false) return false
  if (!isChatServerRunning(cfg)) return false
  const list = cfg.chatInclude || cfg.agentInclude
  if (!Array.isArray(list) || !list.length) return false
  const gid = String(e.group_id)
  return list.some((id) => String(id) === gid)
}

function recentLimit(cfg) {
  const n = Number(cfg.chatBufferSize ?? cfg.agentBufferSize)
  if (Number.isFinite(n) && n > 0) return Math.floor(n)
  return 20
}

async function buildEntry(e) {
  const entry = {
    message_id: String(e.message_id),
    user_id: String(e.user_id),
    sender: e.sender,
    message: e.message,
    raw_message: e.raw_message,
    time: e.time,
  }
  return entry
}

export async function append(e, cfg = {}) {
  const sid = sessionId(e)
  const entry = await buildEntry(e)
  const ring = recentRings.get(sid) || []
  ring.push(entry)
  const limit = recentLimit(cfg)
  while (ring.length > limit) ring.shift()
  recentRings.set(sid, ring)
  return entry
}

export function snapshotRecent(sid) {
  return [...(recentRings.get(sid) || [])]
}
