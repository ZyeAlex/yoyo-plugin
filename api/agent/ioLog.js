import fs from 'node:fs'
import path from 'node:path'
import setting from '#setting'

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
 * 追加一条 Agent 交互记录（请求 payload + 响应/错误）。
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

/**
 * @param {object} payload buildAgentPayload 的完整结果
 * @param {object} [meta]
 */
export function buildIoLogRecord(payload, meta = {}) {
  const session = payload?.session || {}
  return {
    logged_at: new Date().toISOString(),
    request_id: payload?.request_id || '',
    session_id: session.session_id || '',
    group_id: session.group_id || '',
    bot_id: session.bot_id || '',
    payload,
    ...meta,
  }
}

export default { appendAgentIoLog, buildIoLogRecord, logPath }
