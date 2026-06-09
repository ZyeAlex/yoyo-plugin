const WIKI_API = 'https://wiki.biligame.com/ap/api.php'
const WIKI_ORIGIN = 'https://wiki.biligame.com/ap/'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const BATCH_SIZE = 50
const WIKI_HEADERS = {
  'User-Agent': USER_AGENT,
  'Referer': WIKI_ORIGIN,
  'Accept': 'application/json,text/plain,*/*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function wikiFetch(params, { retries = 3 } = {}) {
  const url = new URL(WIKI_API)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  let lastError
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt) await sleep(800 * attempt)
    const res = await fetch(url, { headers: WIKI_HEADERS })
    if (res.ok) return res.json()
    lastError = new Error(`Wiki API HTTP ${res.status}`)
    if (![429, 567, 503].includes(res.status)) throw lastError
  }
  throw lastError
}

/**
 * SMW ask 单次查询
 */
export async function smwAsk(query, { limit = 50, offset = 0 } = {}) {
  const fullQuery = query.includes('|limit=')
    ? query.replace(/\|limit=\d+/, `|limit=${limit}`)
    : `${query}|limit=${limit}`
  const withOffset = offset ? `${fullQuery}|offset=${offset}` : fullQuery
  const data = await wikiFetch({
    action: 'ask',
    query: withOffset,
    format: 'json',
  })
  return data?.query?.results || {}
}

/**
 * SMW ask 分页拉取全部结果
 */
/**
 * 分类成员列表（与「角色图鉴」等列表页同源：分类下的条目）
 */
export async function getCategoryMembersAll(categoryTitle, pageSize = 500) {
  const titles = []
  let cmcontinue
  do {
    const data = await wikiFetch({
      action: 'query',
      list: 'categorymembers',
      cmtitle: categoryTitle,
      cmlimit: String(pageSize),
      ...(cmcontinue ? { cmcontinue } : {}),
      format: 'json',
    })
    const members = data?.query?.categorymembers || []
    titles.push(...members.map(item => item.title))
    cmcontinue = data?.continue?.cmcontinue
  } while (cmcontinue)
  return titles
}

export async function smwAskAll(query, pageSize = 50) {
  const rows = []
  let offset = 0
  while (true) {
    const batch = await smwAsk(query, { limit: pageSize, offset })
    const entries = Object.entries(batch)
    if (!entries.length) break
    rows.push(...entries.map(([page, row]) => ({ page, ...row })))
    if (entries.length < pageSize) break
    offset += pageSize
  }
  return rows
}

function pickPrintout(printouts, key) {
  const val = printouts?.[key]
  if (Array.isArray(val)) return val.length > 1 ? val : (val[0] ?? '')
  return val ?? ''
}

export function parseSmwRow(row) {
  const printouts = row.printouts || {}
  const meta = {}
  Object.keys(printouts).forEach(key => {
    const val = printouts[key]
    meta[key] = Array.isArray(val) && val.length === 1 ? val[0] : val
  })
  return {
    page: row.fulltext || row.page,
    id: pickPrintout(printouts, 'Id') || pickPrintout(printouts, 'id'),
    meta,
  }
}

/**
 * 批量获取页面 wikitext
 */
export async function getWikitextBatch(titles) {
  const map = {}
  const list = [...new Set(titles.filter(Boolean))]
  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const chunk = list.slice(i, i + BATCH_SIZE)
    const data = await wikiFetch({
      action: 'query',
      titles: chunk.join('|'),
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      format: 'json',
      formatversion: '2',
    })
    for (const page of data?.query?.pages || []) {
      if (page.missing) continue
      map[page.title] = page.revisions?.[0]?.slots?.main?.content || ''
    }
  }
  return map
}

/**
 * 获取 Wiki 图片 URL
 */
export async function getWikiImageUrl(fileName) {
  const data = await wikiFetch({
    action: 'query',
    titles: `File:${fileName}`,
    prop: 'imageinfo',
    iiprop: 'url',
    format: 'json',
  })
  const page = Object.values(data?.query?.pages || {})[0]
  return page?.imageinfo?.[0]?.url
}
