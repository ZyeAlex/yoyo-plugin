import { stripHtml } from './parser.js'

const HEADING_RE = /^(={2,6})\s*(.+?)\s*\1\s*$/

/**
 * 按 MediaWiki 标题切分章节（含 level）
 */
export function splitWikitextSections(wikitext = '') {
  const lines = String(wikitext).split('\n')
  const sections = []
  let current = null

  const pushCurrent = () => {
    if (!current) return
    sections.push({
      ...current,
      body: current.lines.join('\n').trim(),
    })
    current = null
  }

  for (const line of lines) {
    const match = line.match(HEADING_RE)
    if (match) {
      pushCurrent()
      current = {
        title: match[2].trim(),
        level: match[1].length,
        lines: [],
      }
      continue
    }
    if (!current) {
      if (!line.trim()) continue
      current = { title: '_preamble', level: 1, lines: [] }
    }
    current.lines.push(line)
  }
  pushCurrent()
  return sections
}

function stripTemplates(text = '') {
  let out = ''
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{' && text[i + 1] === '{') {
      depth++
      i++
      continue
    }
    if (text[i] === '}' && text[i + 1] === '}') {
      if (depth > 0) depth--
      i++
      continue
    }
    if (depth === 0) out += text[i]
  }
  return out
}

function stripWikiMarkup(text = '') {
  return String(text)
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref\b[^>]*\/>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\[\[(?:file|File|文件|Image|image):[^\]]+\]\]/gi, '')
    .replace(/<poem>/gi, '\n')
    .replace(/<\/poem>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<center>/gi, '\n')
    .replace(/<\/center>/gi, '\n')
    .replace(/<big>/gi, '')
    .replace(/<\/big>/gi, '')
    .replace(/<font[^>]*>/gi, '')
    .replace(/<\/font>/gi, '')
    .replace(/'''(.+?)'''/g, '$1')
    .replace(/''(.+?)''/g, '$1')
    .replace(/\[\[(?:[^\]|#]*#)?(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1')
    .replace(/\{\{clearboth\}\}/gi, '')
    .replace(/^\s*[:;#*#]+/gm, (m) => (m.includes('#') ? '- ' : ''))
    .replace(/\|[-+]+\|/g, ' ')
    .replace(/\{\|[^]*?\|\}/g, ' ')
}

/**
 * wikitext → 适合 Agent 阅读的纯文本
 */
export function wikitextToPlainText(wikitext = '') {
  let text = stripTemplates(wikitext)
  text = stripWikiMarkup(text)
  text = stripHtml(text)
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function slugifySection(title = '') {
  return String(title)
    .trim()
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, '')
    .replace(/[^\w\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'section'
}

/**
 * 解析整页 wikitext 为章节列表
 */
export function parseWikitextPage(wikitext = '') {
  return splitWikitextSections(wikitext).map((section) => {
    const text = wikitextToPlainText(section.body)
    return {
      id: slugifySection(section.title),
      title: section.title,
      level: section.level,
      text,
      charCount: text.length,
    }
  }).filter(section => section.title !== '_preamble' || section.text)
}
