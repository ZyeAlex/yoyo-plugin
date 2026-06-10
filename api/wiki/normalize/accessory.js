import { stripHtml, parseRarityStars, rarityClass } from '../parser.js'

function parseMainAttrs(params) {
  const attrs = []
  for (let i = 1; i <= 2; i++) {
    const name = params[`主属性${i}`]
    if (!name) continue
    attrs.push({
      name,
      value: params[`主属性${i}值`] || '',
    })
  }
  return attrs
}

function parseSubAttrs(params) {
  const attrs = []
  for (let i = 1; i <= 4; i++) {
    const name = params[`副属性${i}`]
    if (!name) continue
    attrs.push({
      name,
      value: params[`副属性${i}值`] || '',
    })
  }
  return attrs
}

const TYPE_MAP = {
  武器: 1,
  上装: 2,
  下装: 3,
}

export function normalizeAccessory(params, smwMeta = {}) {
  const id = params.id || smwMeta.id
  const stars = parseRarityStars(params['稀有度'] || smwMeta.meta?.['稀有度'])
  const typeName = params['类型'] || smwMeta.meta?.['类型'] || ''

  return {
    id,
    page: smwMeta.page,
    name: params['名称'] || smwMeta.name,
    typeName,
    type: TYPE_MAP[typeName] || 0,
    rarity: stars,
    rarityClass: rarityClass(stars),
    rarityText: params['稀有度'] || '',
    image: params['图片'] || smwMeta.meta?.['图片'] || '',
    desc: stripHtml(params['描述'] || smwMeta.meta?.['描述'] || ''),
    source: params['获取方式'] || '',
    version: params['实装版本'] || '',
    suitName: params['套装'] || smwMeta.meta?.['套装'] || '',
    mainAttrs: parseMainAttrs(params),
    subAttrs: parseSubAttrs(params),
  }
}
