import { sessionId, snapshotRecent } from './buffer.js'
import { buildHints } from './trigger.js'
import { randomUUID } from 'node:crypto'

export function buildChatPayload(e, cfg = {}) {
  const sid = sessionId(e)
  return {
    request_id: randomUUID(),
    session: {
      session_id: sid,
      group_id: String(e.group_id || ''),
      bot_id: String(e.self_id || ''),
    },
    message: {
      message_id: String(e.message_id),
      user_id: String(e.user_id),
      sender: e.sender,
      message: e.message,
      raw_message: e.raw_message,
      time: e.time,
    },
    recent: snapshotRecent(sid),
    hints: buildHints(e, cfg),
  }
}
