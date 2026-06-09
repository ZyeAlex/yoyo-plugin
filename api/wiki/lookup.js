import setting from '../../utils/setting.js'

const ELEMENT_COLORS = {
  火: '#d25556',
  风: '#d2915d',
  地: '#a68b5b',
  木: '#6fad5e',
  冰: '#6eb8d4',
  水: '#5a9fd4',
  雷: '#9b7bd4',
  光: '#d4b85a',
  暗: '#7a5a8a',
  无: '#888888',
}

let elementList
let professionList
let groupList

function loadLists() {
  if (!elementList) elementList = setting.getData('data/game/element', [])
  if (!professionList) professionList = setting.getData('data/game/profession', [])
  if (!groupList) groupList = setting.getData('data/game/groups', [])
}

export function lookupElement(name) {
  loadLists()
  const key = String(name || '').split(/[,、]/)[0].trim()
  const found = elementList.find(item => item.name === key)
  const petElem = found?.icon?.[3]
  return {
    name: key,
    id: found?.id ?? 0,
    petElem,
    skillElem: found?.icon?.[0],
    elementColor: ELEMENT_COLORS[key] || '#888888',
  }
}

export function lookupElements(text = '') {
  return String(text).split(/[,、]/).map(s => lookupElement(s.trim())).filter(e => e.name)
}

export function lookupProfession(name) {
  loadLists()
  return professionList.find(item => item.name === name) || null
}

export function lookupGroup(name) {
  loadLists()
  return groupList.find(item => item.name === name) || null
}

/** 奇波战斗标签 icon 约定 */
const KIBO_TAG_ICONS = {
  独猎: 'tex_battle_tag_kibo_1.png',
  侵扰: 'tex_battle_tag_kibo_2.png',
  守护: 'tex_battle_tag_kibo_3.png',
}

export function lookupKiboTag(tag = '') {
  return {
    title: tag,
    battle: KIBO_TAG_ICONS[tag] || 'tex_battle_tag_kibo_1.png',
  }
}
