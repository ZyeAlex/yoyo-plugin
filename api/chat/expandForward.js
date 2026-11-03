/**
 * 合并转发进群时通常只有 [CQ:forward,id=…] / type=forward，正文需 getForwardMsg 拉平。
 * 在 append / 发包前就地展开，写入可读 text 段，供 transcript 与人设看见。
 */

const CQ_FORWARD_RE = /\[CQ:forward,id=([^\]]+)\]/i

function segGet(seg, ...keys) {
  if (!seg || typeof seg !== 'object') return undefined
  const data = seg.data && typeof seg.data === 'object' ? seg.data : {}
  for (const key of keys) {
    if (seg[key] != null && seg[key] !== '') return seg[key]
    if (data[key] != null && data[key] !== '') return data[key]
  }
  return undefined
}

function flattenSegText(seg) {
  if (!seg || typeof seg !== 'object') return ''
  const typ = String(seg.type || '').toLowerCase()
  if (typ === 'text') return String(segGet(seg, 'text') || '')
  if (typ === 'at') {
    const name = String(segGet(seg, 'name') || '').trim()
    const qq = String(segGet(seg, 'qq') || '').trim()
    if (name) return `@${name}`
    if (qq) return `@${qq}`
    return '@'
  }
  if (typ === 'face' || typ === 'mface') return '[表情]'
  if (typ === 'image') {
    const summary = String(segGet(seg, 'summary') || '')
    if (summary.includes('表情')) return '[表情包]'
    return '[图片]'
  }
  if (typ === 'record') return '[语音]'
  if (typ === 'video') return '[视频]'
  if (typ === 'file') return '[文件]'
  if (typ === 'json' || typ === 'share') return '[分享]'
  if (typ === 'forward' || typ === 'xml') return '[转发]'
  return ''
}

function flattenMessageBody(message) {
  if (Array.isArray(message)) {
    return message.map(flattenSegText).join('').replace(/\s+/g, ' ').trim()
  }
  if (typeof message === 'string') return message.trim()
  return ''
}

export function extractForwardId(e) {
  const segs = Array.isArray(e?.message) ? e.message : []
  for (const seg of segs) {
    if (!seg || typeof seg !== 'object') continue
    const typ = String(seg.type || '').toLowerCase()
    if (typ !== 'forward' && typ !== 'xml') continue
    const id = segGet(seg, 'id', 'resid', 'res_id')
    if (id) return String(id)
    // 部分协议把 resid 嵌在 xml data 字符串里
    const raw = String(segGet(seg, 'data') || '')
    const m = raw.match(/m_resid="([^"]+)"/i) || raw.match(/resid="([^"]+)"/i)
    if (m?.[1]) return m[1]
  }
  const raw = String(e?.raw_message || e?.msg || '')
  const cq = raw.match(CQ_FORWARD_RE)
  return cq?.[1] ? cq[1] : ''
}

export function formatForwardMessages(messages, { maxLines = 40, maxChars = 2500 } = {}) {
  const rows = Array.isArray(messages) ? messages : []
  const lines = ['[转发的聊天记录]']
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue
    const sender = item.sender && typeof item.sender === 'object' ? item.sender : {}
    const name =
      String(item.nickname || sender.card || sender.nickname || item.user_id || sender.user_id || '未知').trim() ||
      '未知'
    const body =
      flattenMessageBody(item.message) ||
      String(item.raw_message || item.content || '')
        .replace(CQ_FORWARD_RE, '[转发]')
        .replace(/\[CQ:[^\]]+\]/gi, '')
        .trim()
    if (!body) continue
    lines.push(`${name}: ${body}`)
    if (lines.length - 1 >= maxLines) {
      lines.push('…（后续省略）')
      break
    }
  }
  if (lines.length <= 1) return '[转发的聊天记录]'
  let text = lines.join('\n')
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}…`
  return text
}

/**
 * 就地改写 e.message / e.raw_message。失败时至少换成可读占位，避免裸 CQ:forward。
 */
export async function expandForwardInPlace(e) {
  const id = extractForwardId(e)
  if (!id) return false

  let text = '[转发的聊天记录]'
  try {
    const getter = e?.bot?.getForwardMsg || e?.group?.getForwardMsg
    if (typeof getter === 'function') {
      const msgs = await getter.call(e.bot || e.group, id)
      text = formatForwardMessages(msgs)
    }
  } catch (err) {
    logger?.warn?.(`[yoyo-chat] getForwardMsg 失败: ${err?.message || err}`)
  }

  const segs = Array.isArray(e.message) ? [...e.message] : []
  const next = segs.filter(seg => {
    const typ = String(seg?.type || '').toLowerCase()
    return typ !== 'forward' && typ !== 'xml'
  })
  next.push({ type: 'text', text })
  e.message = next
  e.raw_message = text
  if (typeof e.msg === 'string') e.msg = text
  return true
}
