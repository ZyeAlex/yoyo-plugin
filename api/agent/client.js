import setting from '#setting'
import { createHttp } from '../../utils/http.js'
import { AGENT_CHAT_PATH, AGENT_MESSAGES_PATH, getAgentBaseURL } from './schema.js'

const response = (data) => {
  if (data?.code !== 0) {
    const err = new Error(data?.message || 'Agent 返回错误')
    err.code = data?.code
    err.response = data
    throw err
  }
  if (data?.data?.queued) {
    return { ...data, queued: true }
  }
  return data
}

/** 无总体 HTTP 超时：由服务端 per-step 限时控制；仅防连接挂死用极大值 */
const HTTP_IDLE_MS = 30 * 60 * 1000

function createAgentHttp(cfg = setting.config) {
  return createHttp({
    config: {
      baseURL: getAgentBaseURL(cfg),
      timeout: HTTP_IDLE_MS,
      headers: {
        'Content-Type': 'application/json',
      },
    },
    response,
    reject: (error) => {
      const msg = error.response?.data?.detail
        || error.response?.data?.message
        || error.message
        || 'Agent 服务不可用'
      const err = new Error(msg)
      err.cause = error
      return err
    },
  })
}

/** 向 YoAgent 发送聊天请求（同步 JSON） */
export async function chat(payload, cfg = setting.config) {
  const http = createAgentHttp(cfg)
  return http.post(AGENT_CHAT_PATH, payload)
}

/** 同群 Run 进行中时追发消息入队 */
export async function enqueueMessages(payload, cfg = setting.config) {
  const http = createAgentHttp(cfg)
  const res = await http.post(AGENT_MESSAGES_PATH, payload)
  if (res?.queued) return res
  return res
}

export function parseSseChunk(buffer) {
  const events = []
  const parts = buffer.split('\n\n')
  const rest = parts.pop() ?? ''
  for (const block of parts) {
    if (!block.trim()) continue
    let event = 'message'
    let data = ''
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data += line.slice(5).trim()
    }
    if (!data) continue
    try {
      events.push({ event, data: JSON.parse(data) })
    } catch {
      events.push({ event, data: { raw: data } })
    }
  }
  return { events, rest }
}

/**
 * SSE 流式聊天：stream=1，按事件回调 onEvent(event, data)。
 * 事件：started（握手，无用户文案）、status（整轮最多一条短进度句）、reply、error、done。
 */
export async function chatStream(payload, onEvent, cfg = setting.config) {
  const baseURL = getAgentBaseURL(cfg)
  let res
  try {
    res = await fetch(`${baseURL}${AGENT_CHAT_PATH}?stream=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    throw err
  }

  if (!res.ok) {
    let message = `Agent HTTP ${res.status}`
    try {
      const body = await res.json()
      message = body?.message || body?.detail || message
    } catch {
      // ignore
    }
    throw new Error(message)
  }

  const reader = res.body?.getReader()
  if (!reader) {
    throw new Error('Agent 未返回可读流')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let sawDone = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parsed = parseSseChunk(buffer)
      buffer = parsed.rest
      for (const { event, data } of parsed.events) {
        if (event === 'done') {
          sawDone = true
          continue
        }
        await onEvent(event, data)
      }
    }

    if (buffer.trim()) {
      const parsed = parseSseChunk(`${buffer}\n\n`)
      for (const { event, data } of parsed.events) {
        if (event === 'done') sawDone = true
        else await onEvent(event, data)
      }
    }
  } finally {
    reader.releaseLock?.()
  }

  if (!sawDone) {
    throw new Error('Agent 流未正常结束')
  }
}

export default { chat, chatStream, enqueueMessages }
