import { getWikitextBatch } from './client.js'

const SUIT_TEMPLATE = 'Template:装备图鉴/套装'
const TYPE_ORDER = { 武器: 1, 上装: 2, 下装: 3, 耳环: 4, 戒指: 5 }
const TIER_SUFFIXES = [
  '狂力', '披甲', '束甲', '降声', '之环', '刺剑', '战甲', '短甲', '耳环', '戒指',
  '法杖', '斗篷', '护腿', '耳饰', '指环', '刺弓', '披风', '重剑', '重甲', '护甲',
  '耳坠', '指环', '弓', '之束', '幽行', '飞翼', '辉环',
]

function extractSwitchBlock(wikitext, label) {
  const re = new RegExp(`\\|${label}=\\{\\{#switch:[\\s\\S]*?\\n([\\s\\S]*?)\\n\\}\\}`)
  return wikitext.match(re)?.[1] || ''
}

export function parseAttrRange(raw) {
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

function normalizeAccessoryAttrs(accessory = {}) {
  const mainAttrs = (accessory.mainAttrs || []).map((attr, index) => {
    if (attr.text) return attr
    const range = parseAttrRange(attr.value)
    return { ...attr, ...range, value: range.text || attr.value || '' }
  })
  const subAttrs = (accessory.subAttrs || []).map((attr, index) => ({
    ...attr,
    enhanceLevel: attr.enhanceLevel ?? (index > 0 ? index * 3 : 0),
    enhanceLabel: attr.enhanceLabel ?? (index > 0 ? `(+${index * 3})` : ''),
  }))
  return { ...accessory, mainAttrs, subAttrs }
}

export function deriveTierLabel(name = '') {
  for (const suffix of TIER_SUFFIXES) {
    if (name.endsWith(suffix)) {
      const label = name.slice(0, -suffix.length)
      if (label) return label
    }
  }
  return name.slice(0, 2) || name
}

export function sortAccessoryPieces(pieces = []) {
  return [...pieces].sort((a, b) => {
    const ta = TYPE_ORDER[a.typeName] || a.type || 99
    const tb = TYPE_ORDER[b.typeName] || b.type || 99
    return ta - tb || Number(a.id) - Number(b.id)
  })
}

export function groupSuitTiers(pieces = []) {
  const groups = new Map()
  for (const piece of pieces) {
    const key = `${piece.rarityClass ?? piece.rarity ?? 0}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(piece)
  }
  return [...groups.entries()]
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([, tierPieces]) => {
      const piecesSorted = sortAccessoryPieces(tierPieces)
      const lead = piecesSorted.find(p => p.typeName === '武器') || piecesSorted[0]
      const label = deriveTierLabel(lead?.name || '')
      return {
        label,
        rarity: lead?.rarity || 0,
        rarityClass: lead?.rarityClass || 0,
        rarityText: lead?.rarityText || '',
        pieces: piecesSorted,
        pieceCount: piecesSorted.length,
        coverImage: lead?.image || '',
      }
    })
}

export function parseSuitSetTemplate(wikitext = '') {
  const names = {}
  for (const m of extractSwitchBlock(wikitext, '名字').matchAll(/\|(\d+)=(.+)/g)) {
    names[m[1]] = m[2].trim()
  }

  const skills = {}
  for (const m of extractSwitchBlock(wikitext, '技能描述').matchAll(/\|(\d+)\|[^=]+=(.+)/g)) {
    const raw = m[2].trim()
    const parts = raw.split(/<br\s*\/?>\s*4件套：/)
    const effect2 = parts[0].replace(/^2件套：/, '').trim()
    const effect4 = (parts[1] || '').trim()
    skills[m[1]] = {
      effect2,
      effect4,
      skillDesc: [effect2 && `2件套：${effect2}`, effect4 && `4件套：${effect4}`].filter(Boolean).join('\n'),
    }
  }

  const pets = {}
  for (const m of extractSwitchBlock(wikitext, '相关奇波').matchAll(/\|(\d+)\|[^=]+=(.+)/g)) {
    pets[m[1]] = m[2].trim()
  }

  return Object.keys(names)
    .sort((a, b) => Number(a) - Number(b))
    .map(id => ({
      id: Number(id),
      name: names[id],
      effect2: skills[id]?.effect2 || '',
      effect4: skills[id]?.effect4 || '',
      skillDesc: skills[id]?.skillDesc || '',
      relatedPet: pets[id] || '',
    }))
}

export async function fetchSuitSets() {
  const map = await getWikitextBatch([SUIT_TEMPLATE])
  const wikitext = map[SUIT_TEMPLATE] || map['模板:装备图鉴/套装'] || Object.values(map)[0] || ''
  const suits = parseSuitSetTemplate(wikitext)
  if (!suits.length) throw new Error('未能从 Wiki 模板解析套装数据')
  return suits
}

export function enrichSuitSets(suits = [], accessories = []) {
  const bySuit = {}
  for (const accessory of accessories) {
    const suitName = accessory.suitName || accessory.suit
    if (!suitName) continue
    if (!bySuit[suitName]) bySuit[suitName] = []
    bySuit[suitName].push(accessory)
  }

  return suits.map(suit => {
    const pieces = sortAccessoryPieces(bySuit[suit.name] || [])
    const tiers = groupSuitTiers(pieces)
    const cover = pieces.find(p => p.typeName === '武器') || pieces[0]
    return {
      ...suit,
      pieces,
      tiers,
      tierCount: tiers.length,
      pieceCount: pieces.length,
      coverImage: cover?.image || '',
    }
  })
}

export function lookupSuitMeta(suits = [], suitName = '') {
  return suits.find(suit => suit.name === suitName) || null
}

export function buildAccessoryAtlasContext(accessory, suits = [], accessories = []) {
  if (!accessory) return accessory
  const normalized = normalizeAccessoryAttrs(accessory)
  const suit = lookupSuitMeta(suits, normalized.suitName)
  const allPieces = sortAccessoryPieces(
    accessories.filter(item => item.suitName === normalized.suitName),
  )
  const tiers = suit?.tiers || groupSuitTiers(allPieces)
  const currentTier = tiers.find(tier => tier.pieces.some(p => String(p.id) === String(normalized.id))) || null
  return {
    ...normalized,
    suitData: suit,
    suitTiers: tiers,
    currentTierLabel: currentTier?.label || '',
    relatedPet: suit?.relatedPet || '',
    effect2: suit?.effect2 || '',
    effect4: suit?.effect4 || '',
  }
}
