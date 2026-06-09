import {
  stripHtml, parseRarityStars, rarityClass, splitAttrNames, splitLevels,
  buildSkillDescHtml, parseRichText,
} from '../parser.js'
import { lookupElement, lookupElements, lookupProfession, lookupGroup } from '../lookup.js'

function parseSkills(params) {
  const skills = []
  for (let i = 1; i <= 6; i++) {
    const name = params[`技能${i}名`]
    if (!name || name === '0') continue
    const attrLevels = splitLevels(params[`技能${i}属性值`])
    const maxLevel = attrLevels.slice(-1)[0] || []
    const template = params[`技能${i}模板`] || ''
    const rawDesc = params[`技能${i}描述`] || ''
    skills.push({
      name,
      icon: params[`技能${i}图`] || '',
      desc: stripHtml(rawDesc),
      descHtml: template ? buildSkillDescHtml(template, maxLevel) : parseRichText(rawDesc),
      template,
      special: params[`技能${i}星脉密语`] || '',
      attrNames: splitAttrNames(params[`技能${i}属性名`]),
      attrLevels,
      maxLevel,
    })
  }
  return skills
}

function parseTalents(params) {
  const talents = []
  for (let level = 1; level <= 7; level++) {
    const count = Number(params[`星赐${level}数`] || 0)
    if (!count) continue
    const items = []
    for (let i = 1; i <= count; i++) {
      items.push({
        icon: params[`星赐${level}图${i}`] || '',
        name: params[`星赐${level}名${i}`] || '',
        desc: stripHtml(params[`星赐${level}描述${i}`] || ''),
      })
    }
    if (items.length) talents.push({ level, items })
  }
  return talents
}

function parseVoices(params, prefix, countKey) {
  const count = Number(params[countKey] || 0)
  const voices = []
  for (let i = 1; i <= count; i++) {
    voices.push({
      name: params[`${prefix}${i}名`] || '',
      text: stripHtml(params[`${prefix}${i}文本`] || ''),
      file: params[`${prefix}${i}文件`] || '',
    })
  }
  return voices.filter(v => v.name || v.text)
}

export function normalizeHero(params, smwMeta = {}) {
  const id = params.id || smwMeta.id
  const name = params['名称'] || smwMeta.name
  const elementText = params['元素'] || smwMeta.meta?.['元素']?.join?.('、') || smwMeta.meta?.['元素'] || ''
  const stars = parseRarityStars(params['稀有度'] || smwMeta.meta?.['稀有度'])
  const professionName = params['职业'] || smwMeta.meta?.['职业'] || ''
  const groupName = params['阵营'] || smwMeta.meta?.['阵营'] || ''

  return {
    id,
    page: smwMeta.page,
    name,
    englishName: params['英文名'] || '',
    rarity: params['稀有度'] || '',
    rarityStars: stars,
    rarityClass: rarityClass(stars),
    profession: professionName,
    professionData: lookupProfession(professionName),
    element: elementText,
    elementData: lookupElement(elementText),
    elements: lookupElements(elementText),
    weapon: params['武器'] || '',
    group: groupName,
    groupData: lookupGroup(groupName),
    race: params['种族'] || smwMeta.meta?.['种族'] || '',
    birthday: params['生日'] || '',
    desc: stripHtml(params['描述'] || ''),
    intro: stripHtml(params['介绍'] || smwMeta.meta?.['介绍'] || ''),
    headIcon: `tex_hero_head_big_${id}.png`,
    avatarIcon: `tex_icon_hero_m_${id}.png`,
    portraitIcon: `tex_icon_hero_get_${id}.png`,
    skills: parseSkills(params),
    talents: parseTalents(params),
    voices: parseVoices(params, '角色语音', '角色语音数'),
    battleVoices: parseVoices(params, '战斗语音', '战斗语音数'),
    exploreVoices: parseVoices(params, '探索语音', '探索语音数'),
  }
}
