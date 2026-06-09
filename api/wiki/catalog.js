import { getCategoryMembersAll, smwAskAll, getWikitextBatch, parseSmwRow } from './client.js'
import { parseTemplate } from './parser.js'
import { normalizeHero } from './normalize/hero.js'
import { normalizeKibo } from './normalize/kibo.js'
import { normalizeSpirit } from './normalize/spirit.js'
import { normalizeAccessory } from './normalize/accessory.js'
import { normalizeItem } from './normalize/item.js'

const CATALOGS = {
  Hero: {
    listPage: '角色图鉴',
    category: '分类:角色',
    query: '[[分类:角色]]|?名称|?稀有度|?元素|?职业|?阵营|?种族|?介绍|?id|sort=阵营,稀有度,id|order=desc,desc,asc',
    template: '角色图鉴',
    normalize: normalizeHero,
  },
  Kibo: {
    listPage: '奇波图鉴',
    category: '分类:奇波',
    query: '[[分类:奇波]]|?名称|?id|?元素|?种族|?阶段|?标签|?进化下级|sort=id|order=asc',
    template: '奇波图鉴',
    normalize: normalizeKibo,
  },
  Spirit: {
    listPage: '灵子图鉴',
    category: '分类:灵子',
    query: '[[分类:灵子]]|?名称|?id|?稀有度|?职业|?属性|?图片|sort=id|order=asc',
    template: '灵子图鉴',
    normalize: normalizeSpirit,
  },
  Accessory: {
    listPage: '装备图鉴',
    category: '分类:装备',
    query: '[[分类:装备]]|?名称|?id|?稀有度|?类型|?图片|?描述|sort=id|order=asc',
    template: '装备图鉴',
    normalize: normalizeAccessory,
  },
  Item: {
    listPage: '物品图鉴',
    category: '分类:物品',
    query: '[[分类:物品]]|?名称|?id|?稀有度|?类型|?图片|sort=id|order=asc',
    template: '物品图鉴',
    normalize: normalizeItem,
  },
}

async function fetchCatalogList(config) {
  let smwRows = []
  try {
    const rows = await smwAskAll(config.query, config.category?.includes('物品') ? 100 : 50)
    smwRows = rows.map(row => parseSmwRow(row))
  } catch (error) {
    logger.warn(`[yoyo-plugin][wiki] SMW 列表拉取失败（${config.listPage}），改用分类列表: ${error.message}`)
  }

  if (smwRows.length) {
    return smwRows
  }

  const titles = await getCategoryMembersAll(config.category)
  return titles.map(page => ({ page, id: '', meta: {} }))
}

/**
 * 拉取指定类型图鉴数据
 * @param {'Hero'|'Kibo'|'Spirit'|'Accessory'|'Item'} type
 */
export async function fetchCatalog(type) {
  const config = CATALOGS[type]
  if (!config) throw new Error(`Unknown catalog type: ${type}`)

  logger.info(`[yoyo-plugin][wiki] 开始拉取 ${type} 数据（列表: ${config.listPage} → 详情页模板: ${config.template}）...`)
  const smwRows = await fetchCatalogList(config)
  const titles = smwRows.map(r => r.page)
  logger.info(`[yoyo-plugin][wiki] ${type} 列表 ${titles.length} 条，开始拉取详情页 wikitext...`)
  const wikitextMap = await getWikitextBatch(titles)

  const result = []
  for (const smwRow of smwRows) {
    try {
      const wikitext = wikitextMap[smwRow.page] || ''
      const params = parseTemplate(wikitext, config.template)
      const data = config.normalize(params, smwRow)
      if (data.id) result.push(data)
    } catch (error) {
      logger.error(`[yoyo-plugin][wiki] 解析 ${smwRow.page} 失败:`, error)
    }
  }
  logger.info(`[yoyo-plugin][wiki] ${type} 拉取完成，共 ${result.length} 条`)
  return result
}

export { CATALOGS }
