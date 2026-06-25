import fs from 'fs'
import path from 'path'
import setting from '../../utils/setting.js'
import { getWikitextBatch } from './client.js'
import { parseWikitextPage } from './wikitext.js'
import { LORE_PAGE_LIST, getLorePage } from './lorePages.js'

const META_PATH = 'data/game/lore/index'
const RAW_DIR = 'data/game/lore/raw'

function loreRoot() {
  return path.join(setting.path, 'data/game/lore')
}

function rawPath(slug) {
  return path.join(setting.path, RAW_DIR, `${slug}.wikitext`)
}

function ensureDirs() {
  fs.mkdirSync(path.join(loreRoot(), 'raw'), { recursive: true })
}

function readMeta() {
  return setting.getData(META_PATH, { pages: {}, lastRefreshAt: null })
}

function writeMeta(meta) {
  setting.setData(META_PATH, meta)
}

function pageFileExists(page) {
  return fs.existsSync(path.join(setting.path, `${page.storagePath}.yaml`))
}

export function loadLorePage(slugOrKey) {
  const page = getLorePage(slugOrKey)
  if (!page) return null
  return setting.getData(page.storagePath, null)
}

export function loadAllLorePages() {
  const pages = {}
  for (const page of LORE_PAGE_LIST) {
    const data = loadLorePage(page.slug)
    if (data) pages[page.slug] = data
  }
  return pages
}

export function isLoreCacheStale(maxAgeHours = 168) {
  const meta = readMeta()
  if (!meta.lastRefreshAt) return true
  const ageMs = Date.now() - new Date(meta.lastRefreshAt).getTime()
  return ageMs > maxAgeHours * 3600 * 1000
}

export function shouldFetchLore(mode, { cacheMissing = false } = {}) {
  if (mode === 'refresh') return true
  if (cacheMissing) return true
  return isLoreCacheStale(setting.config?.wikiLoreRefreshHours ?? 168)
}

/**
 * 拉取单页并解析为结构化章节
 */
export async function fetchLorePage(page) {
  logger.info(`[yoyo-plugin][wiki] 拉取背景页：${page.title}`)
  const map = await getWikitextBatch([page.title])
  const wikitext = map[page.title]
  if (!wikitext?.trim()) {
    throw new Error(`Wiki 页面为空：${page.title}`)
  }

  ensureDirs()
  fs.writeFileSync(rawPath(page.slug), wikitext, 'utf8')

  const sections = parseWikitextPage(wikitext)
  const fetchedAt = new Date().toISOString()

  return {
    slug: page.slug,
    title: page.title,
    kind: page.kind,
    description: page.description,
    sourceUrl: page.sourceUrl,
    fetchedAt,
    sectionCount: sections.length,
    sections,
  }
}

/**
 * 拉取并写入全部背景页缓存
 * @param {{ mode?: 'init'|'refresh', slugs?: string[] }} options
 */
export async function refreshLoreCache(options = {}) {
  const { mode = 'refresh', slugs } = options
  const targets = slugs?.length
    ? slugs.map(getLorePage).filter(Boolean)
    : LORE_PAGE_LIST

  const cacheMissing = LORE_PAGE_LIST.some(page => !pageFileExists(page))
  if (!shouldFetchLore(mode, { cacheMissing }) && mode !== 'refresh') {
    logger.info('[yoyo-plugin][wiki] 背景页缓存仍有效，跳过拉取')
    return loadAllLorePages()
  }

  const meta = readMeta()
  const pages = { ...meta.pages }
  const result = {}

  for (const page of targets) {
    const data = await fetchLorePage(page)
    setting.setData(page.storagePath, data)
    pages[page.slug] = {
      title: page.title,
      kind: page.kind,
      sourceUrl: page.sourceUrl,
      fetchedAt: data.fetchedAt,
      sectionCount: data.sectionCount,
      storagePath: page.storagePath,
    }
    result[page.slug] = data
  }

  writeMeta({
    pages,
    lastRefreshAt: new Date().toISOString(),
  })

  logger.info(`[yoyo-plugin][wiki] 背景页缓存完成（${targets.length} 页）`)
  return result
}

/**
 * 按标题或 slug 取章节
 */
export function getLoreSection(slugOrKey, sectionQuery) {
  const page = loadLorePage(slugOrKey)
  if (!page?.sections?.length) return null
  const q = String(sectionQuery || '').trim().toLowerCase()
  if (!q) return null
  return page.sections.find((section) => {
    return section.id === q
      || section.title === sectionQuery
      || section.title.toLowerCase().includes(q)
  }) || null
}

/**
 * 简单关键词检索（供后续 Agent 工具使用）
 */
export function searchLoreSections(query, { limit = 5, slugs } = {}) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return []

  const pageSlugs = slugs?.length ? slugs : LORE_PAGE_LIST.map(p => p.slug)
  const hits = []

  for (const slug of pageSlugs) {
    const page = loadLorePage(slug)
    if (!page?.sections) continue
    for (const section of page.sections) {
      const hay = `${section.title}\n${section.text}`.toLowerCase()
      if (!hay.includes(q)) continue
      hits.push({
        pageSlug: page.slug,
        pageTitle: page.title,
        sectionId: section.id,
        sectionTitle: section.title,
        level: section.level,
        excerpt: excerptAround(section.text, q, 120),
        charCount: section.charCount,
      })
    }
  }

  return hits
    .sort((a, b) => scoreHit(a, q) - scoreHit(b, q))
    .slice(0, limit)
}

function excerptAround(text, query, radius = 120) {
  const lower = text.toLowerCase()
  const idx = lower.indexOf(query)
  if (idx < 0) return text.slice(0, radius * 2)
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + query.length + radius)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return prefix + text.slice(start, end).replace(/\s+/g, ' ').trim() + suffix
}

function scoreHit(hit, query) {
  const title = hit.sectionTitle.toLowerCase()
  if (title === query) return 0
  if (title.includes(query)) return 1
  return 2
}

let loreRefreshTimer = null

/** 插件启动后按配置周期检查并后台刷新 */
export function scheduleLoreRefresh() {
  const hours = Number(setting.config?.wikiLoreRefreshHours) || 168
  const intervalMs = Math.max(6, hours / 4) * 3600 * 1000

  const run = () => {
    if (!shouldFetchLore('init', { cacheMissing: LORE_PAGE_LIST.some(p => !pageFileExists(p)) })) return
    refreshLoreCache({ mode: 'init' }).catch(err => {
      logger.error(`[yoyo-plugin][wiki] 背景页定时刷新失败: ${err.message}`)
    })
  }

  run()
  if (loreRefreshTimer) clearInterval(loreRefreshTimer)
  loreRefreshTimer = setInterval(run, intervalMs)
  if (typeof loreRefreshTimer.unref === 'function') loreRefreshTimer.unref()
}
