/** 从 YoAgent 响应中取出待发送的气泡列表（OneBot v11 二维 message） */

export function extractReplies(data) {
  const messages = data?.messages
  if (Array.isArray(messages) && messages.length) {
    return messages
      .filter((bubble) => Array.isArray(bubble) && bubble.length)
      .map((bubble) => ({ message: bubble }))
  }

  const replies = data?.replies
  if (Array.isArray(replies) && replies.length) {
    return replies.filter(
      (r) =>
        r &&
        (r.message?.length || r.segments?.length || r.content || r.type === 'image')
    )
  }

  const one = data?.reply
  if (
    one &&
    (one.message?.length || one.segments?.length || one.content || one.type === 'image')
  ) {
    const fromContent = parseMessagesFromContent(one.content)
    if (fromContent.length) {
      return fromContent.map((message) => ({ message }))
    }
    return [one]
  }

  return []
}

/** 服务端未解析时，插件侧尝试从 content 里的 JSON 提取 messages */
function parseMessagesFromContent(content) {
  if (!content || typeof content !== 'string') return []
  let text = content.trim()
  if (!text.startsWith('{') && !text.startsWith('[')) return []
  const match = text.match(/\{[\s\S]*\}/)
  if (match) text = match[0]
  try {
    const obj = JSON.parse(text)
    const raw = obj.messages || obj.message || (Array.isArray(obj) ? obj : null)
    if (!Array.isArray(raw) || !raw.length) return []
    if (Array.isArray(raw[0])) return raw.filter((b) => Array.isArray(b) && b.length)
    if (raw[0]?.type) return [raw]
  } catch {
    return []
  }
  return []
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function maxReplyCount(cfg = {}) {
  const n = Number(cfg.agentMaxReplies)
  if (!Number.isFinite(n) || n < 1) return 3
  return Math.min(3, Math.max(1, Math.floor(n)))
}

/** 限制连发条数 */
export function expandReplyBubbles(replies, cfg = {}) {
  return (replies || []).slice(0, maxReplyCount(cfg))
}

function segmentData(seg) {
  return seg?.data && typeof seg.data === 'object' ? seg.data : {}
}

function onebotSegmentToYunzai(seg) {
  if (!seg || !seg.type) return []
  const data = segmentData(seg)
  const type = seg.type
  if (type === 'text') {
    const text = data.text ?? seg.text ?? ''
    return text ? [text] : []
  }
  if (type === 'image') {
    const url = data.file ?? data.url ?? seg.url ?? ''
    return url ? [segment.image(url)] : []
  }
  if (type === 'at') {
    const qq = data.qq ?? seg.qq ?? seg.user_id ?? ''
    return qq ? [segment.at(qq)] : []
  }
  if (type === 'face') {
    const id = data.id ?? seg.id
    return id != null ? [segment.face(id)] : []
  }
  return []
}

export async function sendReply(e, reply) {
  if (!reply) return false

  const segs = reply.message || reply.segments
  if (Array.isArray(segs) && segs.length) {
    const msg = segs.flatMap((s) => onebotSegmentToYunzai(s))
    if (msg.length) {
      await e.reply(msg)
      return true
    }
    return false
  }

  if (reply.type === 'image' && reply.content) {
    await e.reply(segment.image(reply.content))
    return true
  }

  if (reply.content) {
    await e.reply(reply.content)
    return true
  }

  return false
}

/** 第 2、3 条连发前的随机延时（毫秒） */
export function randomReplyDelayMs(cfg = {}) {
  const min = Math.max(0, Number(cfg.agentReplyDelayMinMs) || 500)
  const max = Math.max(min, Number(cfg.agentReplyDelayMaxMs) || 2000)
  return min + Math.floor(Math.random() * (max - min + 1))
}

/** 按序连发 1~N 条回复；第 2、3 条前随机等待 0.5~2s；至少一条成功才返回 true */
export async function sendReplies(e, data, cfg = {}) {
  const list = expandReplyBubbles(extractReplies(data), cfg)
  if (!list.length) return false

  let anySent = false
  for (let i = 0; i < list.length; i++) {
    if (i > 0) await sleep(randomReplyDelayMs(cfg))
    if (await sendReply(e, list[i])) anySent = true
  }
  return anySent
}
