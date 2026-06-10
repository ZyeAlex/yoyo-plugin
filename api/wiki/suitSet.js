import { getWikitextBatch } from './client.js'

const SUIT_TEMPLATE = 'Template:装备图鉴/套装'

function extractSwitchBlock(wikitext, label) {
  const re = new RegExp(`\\|${label}=\\{\\{#switch:[\\s\\S]*?\\n([\\s\\S]*?)\\n\\}\\}`)
  return wikitext.match(re)?.[1] || ''
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
  const typeOrder = { 武器: 1, 上装: 2, 下装: 3, 耳环: 4, 戒指: 5 }
  return suits.map(suit => {
    const pieces = (bySuit[suit.name] || []).sort((a, b) => {
      const ta = typeOrder[a.typeName] || a.type || 99
      const tb = typeOrder[b.typeName] || b.type || 99
      return ta - tb || Number(a.id) - Number(b.id)
    })
    const cover = pieces.find(p => p.typeName === '武器') || pieces[0]
    return {
      ...suit,
      pieces,
      pieceCount: pieces.length,
      coverImage: cover?.image || '',
    }
  })
}
