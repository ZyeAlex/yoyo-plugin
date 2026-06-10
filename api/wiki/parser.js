/**
 * 去除 Wiki HTML markup，保留换行语义
 */
export function stripHtml(text = '') {
  return String(text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Wiki 富文本：保留颜色高亮（<color> / <span style="color:">）与换行 */
export function parseRichText(text = '') {
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/<color=([#a-zA-Z0-9]+)>/gi, '<span style="color:$1">')
    .replace(/<\/color>/gi, '</span>')
    .replace(/<\s*span([^>]*)>/gi, (_, attrs) => {
      const colorMatch = String(attrs).match(/color:\s*(#[a-fA-F0-9]+)/i)
      return colorMatch ? `<span style="color:${colorMatch[1]}">` : ''
    })
    .replace(/<\/span>/gi, '</span>')
    .replace(/<br\s*\/?>/gi, '<br/>')
    .replace(/<\s*\/\s*span\s*>/gi, '</span>')
    .replace(/<(?!\/?(?:span|br)\b)[^>]+>/gi, '')
    .replace(/\n\s*(?=style="color:)/g, ' ')
    .replace(/\n/g, '')
    .trim()
}

export function fillSkillTemplate(template = '', values = []) {
  return String(template).replace(/\{(\d+)\}/g, (_, index) => values[Number(index)] ?? `{${index}}`)
}

/** 技能模板 + 满级属性 → 带颜色高亮的 HTML 描述 */
export function buildSkillDescHtml(template = '', maxLevel = []) {
  if (!template) return ''
  return parseRichText(fillSkillTemplate(template, maxLevel))
}

export function enrichSkills(skills = []) {
  if (!skills?.length) return skills
  return skills.map(skill => enrichSkillDesc(skill))
}

const KIBO_SKILL_LEVEL_COUNT = 5

/** 旧版 yaml：5 级描述被 stripHtml 后逐行堆叠，按 5 级还原最高级文本 */
function parseLegacyMergedKiboDesc(desc = '') {
  const lines = String(desc).split(/\n+/).filter(line => line.trim())
  if (!lines.length) return { level: 1, descHtml: '' }
  const level = KIBO_SKILL_LEVEL_COUNT
  const linesPerLevel = Math.max(1, Math.floor(lines.length / level))
  const start = (level - 1) * linesPerLevel
  return {
    level,
    descHtml: parseRichText(lines.slice(start).join('\n')),
  }
}

function resolveKiboSkillLevel(skill = {}) {
  if (skill.level) return skill.level
  if (skill.descLevels?.length) return skill.descLevels.length
  const text = String(skill.desc || '').trim()
  if (!text) return 1
  const lines = text.split(/\n+/).filter(line => line.trim())
  if (lines.length > 1) return KIBO_SKILL_LEVEL_COUNT
  return 1
}

/** 单条技能：补全 descHtml（角色/奇波通用） */
export function enrichSkillDesc(skill) {
  if (!skill) return skill
  return {
    ...skill,
    level: resolveKiboSkillLevel(skill),
    descHtml: skill.descHtml || buildSkillDescHtml(skill.template, skill.maxLevel)
      || buildKiboSkillDescHtml(skill),
  }
}

/** 奇波技能：仅最高等级描述，保留 Wiki 颜色 */
export function buildKiboSkillDescHtml(skill = {}) {
  if (skill.descLevels?.length) {
    return skill.descLevels[skill.descLevels.length - 1]
  }
  if (skill.desc?.includes('<span')) {
    return String(skill.desc).replace(/\n/g, '<br/>')
  }
  const text = String(skill.desc || '').trim()
  if (!text) return ''
  const lines = text.split(/\n+/).filter(line => line.trim())
  if (lines.length <= 1) return parseRichText(text)
  return parseLegacyMergedKiboDesc(text).descHtml
}

export function parseKiboSkillDesc(params, prefix, count = 5) {
  const rawParts = []
  for (let i = 1; i <= count; i++) {
    const val = params[`${prefix}${i}`]
    if (val) rawParts.push(val)
  }
  const descLevels = rawParts.map(v => parseRichText(v))
  const maxRaw = rawParts[rawParts.length - 1] || ''
  return {
    descHtml: descLevels[descLevels.length - 1] || '',
    desc: stripHtml(maxRaw),
    descLevels,
    level: rawParts.length || 1,
  }
}

export function enrichPetAtlasSkills(data = {}) {
  return {
    ...data,
    fixedSkill: enrichSkillDesc(data.fixedSkill),
    breakSkill: enrichSkillDesc(data.breakSkill),
    skills: data.skills?.map(enrichSkillDesc),
  }
}

/**
 * 从 wikitext 解析指定模板的 key=value 参数
 */
export function parseTemplate(wikitext, templateName) {
  const escaped = templateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const reg = new RegExp(`\\{\\{${escaped}\\s*([\\s\\S]*?)\\}\\}`, 'i')
  const match = wikitext.match(reg)
  if (!match) return {}
  const params = {}
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^\|([^=]+)=(.*)$/)
    if (kv) params[kv[1].trim()] = kv[2].trim()
  }
  return params
}

export function parseRarityStars(rarity = '') {
  const raw = String(rarity).trim()
  const digitMatch = raw.match(/(\d+)星/)
  if (digitMatch) return Number(digitMatch[1])
  const upper = raw.toUpperCase()
  if (upper.includes('SSR')) return 5
  if (upper.includes('SR')) return 4
  if (/^R$/.test(upper)) return 3
  return 0
}

/** 稀有度 CSS 类（与 resources/hero/list.css 对齐） */
export function rarityClass(stars) {
  if (stars >= 5) return 4
  if (stars >= 4) return 3
  if (stars >= 3) return 2
  if (stars >= 2) return 1
  return 0
}

export function splitList(text = '', sep = /[,、]/) {
  return String(text).split(sep).map(s => s.trim()).filter(Boolean)
}

export function splitLevels(text = '') {
  return String(text).split('/').map(level => level.split(',').map(v => v.trim()))
}

export function splitAttrNames(text = '') {
  return String(text).split(',').map(s => s.trim()).filter(Boolean)
}

export function joinSkillDesc(params, prefix, count = 5) {
  const parts = []
  for (let i = 1; i <= count; i++) {
    const val = params[`${prefix}${i}`]
    if (val) parts.push(parseRichText(val))
  }
  return parts.join('<br/>')
}
