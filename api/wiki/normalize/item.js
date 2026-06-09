import { stripHtml, parseRarityStars, rarityClass } from '../parser.js'

export function normalizeItem(params, smwMeta = {}) {
  const id = params.id || smwMeta.id
  const stars = parseRarityStars(params['稀有度'] || smwMeta.meta?.['稀有度'])

  return {
    id,
    page: smwMeta.page,
    name: params['名称'] || smwMeta.name,
    typeName: params['类型'] || params['料理类型'] || smwMeta.meta?.['类型'] || '',
    rarity: stars,
    rarityClass: rarityClass(stars),
    rarityText: params['稀有度'] || '',
    image: params['图片'] || smwMeta.meta?.['图片'] || '',
    image2: params['图片2'] || '',
    version: params['实装版本'] || '',
    desc: stripHtml(params['描述'] || ''),
    source: params['获取方式'] || '',
    effect: stripHtml(params['效果'] || ''),
  }
}
