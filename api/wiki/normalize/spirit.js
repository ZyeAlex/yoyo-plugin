import { stripHtml, parseRarityStars, rarityClass } from '../parser.js'
import { lookupProfession } from '../lookup.js'

const SPIRIT_ATTR_ORDER = ['基础攻击', '基础物理防御', '基础魔法防御', null, '基础生命']

function buildSpiritAttrs(params = {}) {
  const attributeName = params['属性'] || ''
  const names = SPIRIT_ATTR_ORDER.map(key => key || attributeName).filter(Boolean)
  const seen = new Set()
  return names
    .filter(name => {
      if (seen.has(name)) return false
      seen.add(name)
      return true
    })
    .map(name => ({
      name,
      lv1: params[name] || '',
      lv80: params[`80${name}`] || '',
    }))
    .filter(attr => attr.lv1 || attr.lv80)
}

export function normalizeSpirit(params, smwMeta = {}) {
  const id = params.id || smwMeta.id
  const stars = parseRarityStars(params['稀有度'] || smwMeta.meta?.['稀有度'])
  const professionName = params['职业'] || smwMeta.meta?.['职业'] || ''

  return {
    id,
    page: smwMeta.page,
    name: params['名称'] || smwMeta.name,
    rarity: params['稀有度'] || '',
    rarityStars: stars,
    rarityClass: rarityClass(stars),
    profession: professionName,
    professionData: lookupProfession(professionName),
    attribute: params['属性'] || smwMeta.meta?.['属性'] || '',
    image: params['图片'] || smwMeta.meta?.['图片'] || '',
    image2: params['图片2'] || '',
    version: params['实装版本'] || '',
    attrs: buildSpiritAttrs(params),
    desc: stripHtml(params['描述'] || ''),
    skillDesc: stripHtml(params['技能描述'] || ''),
    maxSkillDesc: stripHtml(params['满星技能描述'] || ''),
    relatedHero: params['相关角色'] || '',
    portraitIcon: params['图片2'] || params['图片'] || smwMeta.meta?.['图片2'] || smwMeta.meta?.['图片'] || '',
  }
}

export { buildSpiritAttrs }
