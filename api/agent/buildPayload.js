import { randomUUID } from 'node:crypto'
import utils from '#utils'
import { sessionId } from './buffer.js'

/**
 * @param {import('../../../lib/plugins/loader.js')} e
 * @param {object[]} messages 内存缓冲中的 OneBot 消息列表
 */
export function buildAgentPayload(e, taken) {
  const batch = taken?.batch ?? taken ?? []
  const recent = taken?.recent ?? []
  return {
    request_id: randomUUID(),
    session: {
      session_id: sessionId(e),
      group_id: String(e.group_id),
      bot_id: String(e.self_id),
    },
    caller: utils.resolveCallerAuth(e),
    messages: batch,
    recent_messages: recent,
  }
}

export default { buildAgentPayload }
