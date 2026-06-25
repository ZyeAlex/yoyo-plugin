/** 群会话内存缓冲（重启丢失，零 Redis 开销） */
const buffers = new Map()

export function sessionId(e) {
  return `group:${e.group_id}:bot:${e.self_id}`
}

/** agentEnabled 且群号在 agentInclude 白名单内 */
export function isAgentGroup(e, cfg = {}) {
  if (!cfg.agentEnabled || !e.isGroup || !e.group_id) return false
  const list = cfg.agentInclude
  if (!Array.isArray(list) || !list.length) return false
  const gid = String(e.group_id)
  return list.some((id) => String(id) === gid)
}

function bufferLimit(cfg) {
  return cfg.agentBufferSize || 10
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

  if (e.reply_id && e.getReply) {
    try {
      const src = await e.getReply()
      if (src) {
        entry.reply = {
          message_id: String(src.message_id ?? e.reply_id),
          user_id: src.sender?.user_id != null ? String(src.sender.user_id) : undefined,
          sender: src.sender,
          message: src.message,
          raw_message: src.raw_message,
        }
      }
    } catch (err) {
      logger.debug(`[yoyo-agent] getReply failed: ${err.message}`)
    }
  }

  return entry
}

/** 追加一条消息，保留最近 limit 条 */
export async function append(e, cfg) {
  const sid = sessionId(e)
  const limit = bufferLimit(cfg)
  const buf = buffers.get(sid) || []
  buf.push(await buildEntry(e))
  buffers.set(sid, buf.length > limit ? buf.slice(-limit) : buf)
}

/** 取出并清空缓冲区（触发 Agent 时调用） */
export function take(sid) {
  const buf = buffers.get(sid) || []
  buffers.delete(sid)
  return buf
}
