import { stripHtml, parseRarityStars, rarityClass } from '../parser.js'

function parseAttrRange(raw) {
  const parts = String(raw || '').split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length >= 2) {
    const max = parts[parts.length - 1]
    return { base: parts[0], max, text: `${parts[0]}/${max}` }
  }
  if (parts.length === 1) {
    return { base: parts[0], max: parts[0], text: parts[0] }
  }
  return { base: '', max: '', text: '' }
}

function parseMainAttrs(params) {
  const attrs = []
  for (let i = 1; i <= 2; i++) {
    const name = params[`主属性${i}`]
    if (!name) continue
    const range = parseAttrRange(params[`主属性${i}值`])
    attrs.push({
      name,
      value: range.text,
      base: range.base,
      max: range.max,
    })
  }
  return attrs
}

function parseSubAttrs(params, rarityClassId = 0) {
  const attrs = []
  const slotCount = Math.max(0, Number(rarityClassId) + 1)
  for (let i = 1; i <= slotCount; i++) {
    const name = params[`副属性${i}`]
    if (!name) continue
    attrs.push({
      name,
      value: params[`副属性${i}值`] || '',
      enhanceLevel: i > 1 ? (i - 1) * 3 : 0,
      enhanceLabel: i > 1 ? `(+${(i - 1) * 3})` : '',
    })
  }
  return attrs
}

const TYPE_MAP = {
  武器: 1,
  上装: 2,
  下装: 3,
  耳环: 4,
  戒指: 5,
}

export function normalizeAccessory(params, smwMeta = {}) {
  const id = params.id || smwMeta.id
  const stars = parseRarityStars(params['稀有度'] || smwMeta.meta?.['稀有度'])
  const classId = rarityClass(stars)
  const typeName = params['类型'] || smwMeta.meta?.['类型'] || ''

  return {
    id,
    page: smwMeta.page,
    name: params['名称'] || smwMeta.name,
    typeName,
    type: TYPE_MAP[typeName] || 0,
    rarity: stars,
    rarityClass: classId,
    rarityText: params['稀有度'] || '',
    image: params['图片'] || smwMeta.meta?.['图片'] || '',
    desc: stripHtml(params['描述'] || smwMeta.meta?.['描述'] || ''),
    source: params['获取方式'] || '',
    version: params['实装版本'] || '',
    suitName: params['套装'] || smwMeta.meta?.['套装'] || '',
    mainAttrs: parseMainAttrs(params),
    subAttrs: parseSubAttrs(params, classId),
  }
}
