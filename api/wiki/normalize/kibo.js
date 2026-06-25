import fs from 'fs'
import path from 'path'
import { stripHtml, parseKiboSkillDesc } from '../parser.js'
import { lookupElements, lookupKiboTag } from '../lookup.js'
import setting from '../../../utils/setting.js'

function parseKiboSkill(params, prefix) {
  const name = params[prefix]
  if (!name) return null
  return {
    name,
    icon: params[`${prefix}图`] || '',
    element: params[`${prefix}元素`] || '',
    ...parseKiboSkillDesc(params, `${prefix}描述`),
  }
}

function parseTraits(params) {
  const traits = []
  for (let i = 1; i <= 3; i++) {
    const name = params[`特性${i}`]
    if (!name) continue
    traits.push({
      name,
      desc: stripHtml(params[`特性${i}描述`] || ''),
    })
  }
  return traits
}

export function normalizeKibo(params, smwMeta = {}) {
  const id = params.id || smwMeta.id
  const name = params['名称'] || smwMeta.name
  const elementText = params['元素'] || smwMeta.meta?.['元素'] || ''
  const heightText = params['身高'] || ''
  const heightMatch = heightText.match(/([\d.]+)/)

  return {
    id,
    page: smwMeta.page,
    name,
    element: elementText,
    elements: lookupElements(elementText),
    race: String(params['种族'] || '').split('·').map(s => s.trim()).filter(Boolean),
    stage: params['阶段'] || smwMeta.meta?.['阶段'] || '',
    tag: params['标签'] || smwMeta.meta?.['标签'] || '',
    tagData: lookupKiboTag(params['标签'] || smwMeta.meta?.['标签'] || ''),
    height: heightText,
    heightCm: heightMatch ? Number(heightMatch[1]) : 0,
    sizeType: params['体型'] || '',
    traits: parseTraits(params),
    feature: params['特征'] || '',
    homeJobs: params['家园工种'] || '',
    drops: params['掉落素材'] || '',
    desc: stripHtml(params['描述'] || ''),
    petIcon: `tex_icon_pet_${id}.png`,
    fixedSkill: parseKiboSkill(params, '固定技能'),
    skills: [1, 2].map(i => parseKiboSkill(params, `技能${i}`)).filter(Boolean),
    breakSkill: parseKiboSkill(params, '合击技能'),
    evolutionSeries: params['进化系列'] || '',
    evolutionNext: params['进化下级'] || smwMeta.meta?.['进化下级'] || '',
    evolutionNextMaterial: params['进化下级材料'] || '',
    evolutionNextLevel: params['进化下级等级'] || '',
  }
}

function normalizeEvolutionNext(value) {
  if (!value) return ''
  if (Array.isArray(value)) return value[0] || ''
  return String(value).trim()
}

export function isKiboStorySpecial(pet) {
  return String(pet?.page || '').includes('特殊')
}

export function buildKiboPetIds(pets) {
  return Object.entries(pets).reduce((ids, [id, pet]) => {
    if (!pet?.name || isKiboStorySpecial(pet)) return ids
    ids[pet.name] = id
    return ids
  }, {})
}

function buildKiboLookupMaps(pets) {
  const byPage = {}
  const byName = {}
  Object.values(pets).forEach(pet => {
    if (!pet?.id || isKiboStorySpecial(pet)) return
    if (pet.page) byPage[pet.page] = pet.id
    if (pet.name) byName[pet.name] = pet.id
  })
  return { byPage, byName }
}

export function enrichKiboCardAssets(pets) {
  const uiDir = path.join(setting.path, 'resources/UI')
  Object.values(pets).forEach(pet => {
    if (isKiboStorySpecial(pet)) return
    const id = pet?.id
    if (!id) return
    const bg = `tex_pet_kibo_card_background_${id}.png`
    if (!fs.existsSync(path.join(uiDir, bg))) {
      delete pet.kiboBoxCardIcon
      delete pet.size
      return
    }
    pet.kiboBoxCardIcon = [
      `tex_icon_petcard_${id}.png`,
      `tex_icon_petcard_${id}_s1.png`,
      bg,
      `tex_pet_kibo_card_foreground_${id}.png`,
      `tex_pet_kibo_card_kibo_${id}.png`,
    ]
    pet.size = (pet.heightCm || 0) * 10000
  })
  return pets
}

export function buildKiboEvolutionChains(pets) {
  const { byPage, byName } = buildKiboLookupMaps(pets)

  function resolveEvolutionNext(nextName) {
    if (!nextName) return null
    if (byPage[nextName]) return byPage[nextName]
    return byName[nextName] || null
  }

  const prevByNextId = {}
  Object.values(pets).forEach(pet => {
    if (isKiboStorySpecial(pet)) return
    const nextName = normalizeEvolutionNext(pet.evolutionNext)
    if (!nextName) return
    const nextId = resolveEvolutionNext(nextName)
    if (!nextId || isKiboStorySpecial(pets[nextId])) return
    if (!prevByNextId[nextId]) prevByNextId[nextId] = []
    prevByNextId[nextId].push(pet.id)
  })

  function findRootId(petId) {
    let rootId = petId
    const visited = new Set([petId])
    while (true) {
      const prevIds = prevByNextId[rootId]
      if (!prevIds?.length) break
      const prevId = [...prevIds].sort((a, b) => Number(a) - Number(b))[0]
      if (visited.has(prevId)) break
      visited.add(prevId)
      rootId = prevId
    }
    return rootId
  }

  function buildForwardChain(rootId) {
    const chain = []
    let currentId = rootId
    const visited = new Set()
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId)
      const pet = pets[currentId]
      if (!pet?.name) break
      chain.push(currentId)
      const nextName = normalizeEvolutionNext(pet.evolutionNext)
      currentId = nextName ? resolveEvolutionNext(nextName) : null
    }
    return chain
  }

  Object.values(pets).forEach(pet => {
    if (!pet?.id || isKiboStorySpecial(pet)) return
    const rootId = findRootId(pet.id)
    const chainIds = buildForwardChain(rootId)
    pet.evolution = chainIds
      .map(id => pets[id])
      .filter(p => p?.name && !isKiboStorySpecial(p))
    pet.evolutionName = pet.evolutionSeries || pets[rootId]?.evolutionSeries || '成长'
  })
  enrichKiboCardAssets(pets)
  return pets
}
