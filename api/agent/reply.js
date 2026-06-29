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

/** 长延迟后 e.reply 可能失效，保留群/账号快照走 Bot 直发 */
export function captureReplyTarget(e) {
  return {
    isGroup: !!e?.isGroup,
    group_id: e?.group_id != null ? String(e.group_id) : '',
    user_id: e?.user_id != null ? String(e.user_id) : '',
    self_id: e?.self_id != null ? String(e.self_id) : '',
  }
}

async function sendViaBot(target, msg) {
  const bot = global.Bot?.[target.self_id]
  if (!bot) return false
  try {
    if (target.isGroup && target.group_id && bot.pickGroup) {
      await bot.pickGroup(target.group_id).sendMsg(msg)
      return true
    }
    if (!target.isGroup && target.user_id && bot.pickUser) {
      await bot.pickUser(target.user_id).sendMsg(msg)
      return true
    }
  } catch (err) {
    logger.warn(`[yoyo-agent] Bot.sendMsg 失败: ${err.message}`)
  }
  return false
}

/**
 * @param {import('../../../lib/plugins/loader.js')} e
 * @param {object} reply
 * @param {{ isGroup?: boolean, group_id?: string, user_id?: string, self_id?: string }} [target]
 * @returns {Promise<{ sent: boolean, via?: string }>}
 */
export async function sendReply(e, reply, target = null) {
  if (!reply) return { sent: false }

  const segs = reply.message || reply.segments
  let msg = null
  if (Array.isArray(segs) && segs.length) {
    msg = segs.flatMap((s) => onebotSegmentToYunzai(s))
  } else if (reply.type === 'image' && reply.content) {
    msg = [segment.image(reply.content)]
  } else if (reply.content) {
    msg = [reply.content]
  }
  if (!msg?.length) return { sent: false }

  const ctx = target || captureReplyTarget(e)

  try {
    await e.reply(msg)
    return { sent: true, via: 'e.reply' }
  } catch (err) {
    logger.warn(`[yoyo-agent] e.reply 失败: ${err.message}`)
  }

  if (await sendViaBot(ctx, msg)) {
    return { sent: true, via: 'bot.sendMsg' }
  }
  return { sent: false }
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
  if (type === 'reply') {
    const id = data.id ?? seg.id
    return id != null && id !== '' ? [segment.reply(id)] : []
  }
  if (type === 'face') {
    const id = data.id ?? seg.id
    return id != null ? [segment.face(id)] : []
  }
  return []
}

/** 按序连发 1~N 条回复；第 2、3 条前随机等待 0.5~2s；至少一条成功才返回 true */
export async function sendReplies(e, data, cfg = {}, target = null) {
  const list = expandReplyBubbles(extractReplies(data), cfg)
  if (!list.length) return { sent: false, via: null }

  let anySent = false
  let lastVia = null
  const ctx = target || captureReplyTarget(e)
  for (let i = 0; i < list.length; i++) {
    if (i > 0) await sleep(randomReplyDelayMs(cfg))
    const result = await sendReply(e, list[i], ctx)
    if (result.sent) {
      anySent = true
      lastVia = result.via || lastVia
    }
  }
  return { sent: anySent, via: lastVia }
}

/** 第 2、3 条连发前的随机延时（毫秒） */
export function randomReplyDelayMs(cfg = {}) {
  const min = Math.max(0, Number(cfg.agentReplyDelayMinMs) || 500)
  const max = Math.max(min, Number(cfg.agentReplyDelayMaxMs) || 2000)
  return min + Math.floor(Math.random() * (max - min + 1))
}
