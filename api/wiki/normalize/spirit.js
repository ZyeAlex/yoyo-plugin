import { stripHtml, parseRarityStars, rarityClass } from '../parser.js'
import { lookupProfession } from '../lookup.js'

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
    baseHp: params['基础生命'] || '',
    baseAtk: params['基础攻击'] || '',
    basePDef: params['基础物理防御'] || '',
    baseMDef: params['基础魔法防御'] || '',
    hp: params['生命'] || '',
    desc: stripHtml(params['描述'] || ''),
    skill: stripHtml(params['技能'] || ''),
    skillDesc: stripHtml(params['技能描述'] || ''),
    maxSkillDesc: stripHtml(params['满星技能描述'] || ''),
    relatedHero: params['相关角色'] || '',
  }
}
