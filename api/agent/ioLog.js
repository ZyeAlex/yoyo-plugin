import fs from 'node:fs'
import path from 'node:path'
import setting from '#setting'
import { extractReplies } from './reply.js'

const LOG_DIR = 'data/logs'
const LOG_FILE = 'agent-io.jsonl'
const MAX_BYTES = 20 * 1024 * 1024 // 20MB，超出时保留后半段

function logPath() {
  return path.join(setting.path, LOG_DIR, LOG_FILE)
}

function ensureLogDir() {
  fs.mkdirSync(path.join(setting.path, LOG_DIR), { recursive: true })
}

/** 截断过长日志，避免无限增长 */
function trimIfNeeded(file) {
  try {
    const stat = fs.statSync(file)
    if (stat.size <= MAX_BYTES) return
    const buf = fs.readFileSync(file)
    const tail = buf.subarray(Math.floor(buf.length / 2))
    const nl = tail.indexOf(10)
    const kept = nl >= 0 ? tail.subarray(nl + 1) : tail
    fs.writeFileSync(file, kept)
  } catch {
    // ignore trim errors
  }
}

/**
 * 追加一条 Agent 交互记录（JSONL，一行一条）。
 * direction=user 为用户触发入站；direction=bot 为机器人侧结果出站。
 * @param {object} record
 */
export function appendAgentIoLog(record) {
  try {
    ensureLogDir()
    const file = logPath()
    const line = `${JSON.stringify(record)}\n`
    fs.appendFileSync(file, line, 'utf8')
    trimIfNeeded(file)
  } catch (err) {
    logger.error(`[yoyo-agent] ioLog 写入失败: ${err.message}`)
  }
}

function sessionMeta(payload) {
  const session = payload?.session || {}
  return {
    request_id: payload?.request_id || '',
    session_id: session.session_id || '',
    group_id: session.group_id || '',
    bot_id: session.bot_id || '',
  }
}

/** 用户触发 Agent 时立即写入（不等 YoAgent 返回） */
export function logUserIn(payload, extra = {}) {
  appendAgentIoLog({
    logged_at: new Date().toISOString(),
    direction: 'user',
    ...sessionMeta(payload),
    caller: payload?.caller || null,
    messages: payload?.messages || [],
    ...extra,
  })
}

function replySummary(data) {
  if (!data) return ''
  const list = extractReplies(data)
  const parts = []
  for (const item of list) {
    const segs = item?.message || item?.segments || []
    for (const seg of segs) {
      const text = seg?.data?.text ?? seg?.text
      if (text) parts.push(String(text))
    }
    if (item?.content) parts.push(String(item.content))
  }
  return parts.join(' ').trim()
}

/** YoAgent 返回 / 兜底 / 异常 后写入机器人侧结果（不含用户 messages，避免与 user 行重复） */
export function logBotOut(payload, startedAt, meta = {}) {
  const { reply, ...rest } = meta
  appendAgentIoLog({
    logged_at: new Date().toISOString(),
    direction: 'bot',
    ...sessionMeta(payload),
    duration_ms: Date.now() - startedAt,
    reply_summary: replySummary(reply),
    reply: reply ?? null,
    ...rest,
  })
}

/** 缓冲为空等无法组 payload 时的最小记录 */
export function logAbortedTurn(e, reason) {
  const sid = `group:${e.group_id}:bot:${e.self_id}`
  const base = {
    logged_at: new Date().toISOString(),
    session_id: sid,
    group_id: String(e.group_id || ''),
    bot_id: String(e.self_id || ''),
    request_id: '',
  }
  appendAgentIoLog({
    ...base,
    direction: 'user',
    caller: null,
    messages: [],
    aborted: reason,
  })
  appendAgentIoLog({
    ...base,
    direction: 'bot',
    ok: false,
    sent: false,
    error: reason,
    duration_ms: 0,
  })
}

export function clearAgentIoLog() {
  try {
    ensureLogDir()
    fs.writeFileSync(logPath(), '', 'utf8')
  } catch (err) {
    logger.error(`[yoyo-agent] ioLog 清空失败: ${err.message}`)
  }
}

/** @deprecated 兼容旧引用，请用 logUserIn / logBotOut */
export function buildIoLogRecord(payload, meta = {}) {
  return {
    logged_at: new Date().toISOString(),
    direction: 'bot',
    ...sessionMeta(payload),
    payload,
    ...meta,
  }
}

export default {
  appendAgentIoLog,
  logUserIn,
  logBotOut,
  logAbortedTurn,
  clearAgentIoLog,
  buildIoLogRecord,
  logPath,
}
