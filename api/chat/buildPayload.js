import { sessionId, snapshotRecent } from './buffer.js'
import { buildHints } from './trigger.js'
import { botNicknameFromCfg, normalizeSender } from './normalizeSender.js'
import { groupNameOf } from '../../utils/xingyuan-group.js'
import { randomUUID } from 'node:crypto'

export function buildChatPayload(e, cfg = {}) {
  const sid = sessionId(e)
  const sender = normalizeSender(e)
  return {
    request_id: randomUUID(),
    session: {
      session_id: sid,
      group_id: String(e.group_id || ''),
      bot_id: String(e.self_id || ''),
      bot_nickname: botNicknameFromCfg(cfg),
      group_name: groupNameOf(e),
    },
    message: {
      message_id: String(e.message_id),
      user_id: String(e.user_id || sender.user_id || ''),
      sender,
      message: e.message,
      raw_message: e.raw_message,
      time: e.time,
    },
    recent: snapshotRecent(sid),
    hints: buildHints(e, cfg),
  }
}
