import game, { parseSpiritHeroQuery } from '#game'
import render from '#render'
import plugin from '#plugin'
import { parseRarityStars, rarityClass } from '../api/wiki/parser.js'
import { buildSpiritAttrs } from '../api/wiki/normalize/spirit.js'

const ATLAS_CFG = { origin: 'BWiki' }
const ITEM_LIST_PAGE_SIZE = 300

function parseItemListPage(e) {
    const m = String(e.msg || '').match(/^#?(?:物品列表|全部物品|所有物品|物品图鉴)(\d+)?$/i)
    return Math.max(1, parseInt(m?.[1], 10) || 1)
}

function enrichSpiritRarity(spirit) {
  if (!spirit) return spirit
  const stars = spirit.rarityStars || parseRarityStars(spirit.rarity)
  let attrs = spirit.attrs
  if (!attrs?.length) {
    const legacy = {}
    if (spirit.baseAtk) legacy['基础攻击'] = spirit.baseAtk
    if (spirit.basePDef) legacy['基础物理防御'] = spirit.basePDef
    if (spirit.baseMDef) legacy['基础魔法防御'] = spirit.baseMDef
    if (spirit.baseHp) legacy['基础生命'] = spirit.baseHp
    if (spirit.attribute && spirit[spirit.attribute]) legacy[spirit.attribute] = spirit[spirit.attribute]
    attrs = buildSpiritAttrs({ ...legacy, 属性: spirit.attribute })
  }
  return {
    ...spirit,
    rarityStars: stars,
    rarityClass: rarityClass(stars),
    portraitIcon: spirit.portraitIcon || spirit.image2 || spirit.image,
    attrs,
  }
}

async function spiritHeroSpiritsAtlas(e, heroId, heroName, spiritIds) {
  const spirits = spiritIds
    .map(id => enrichSpiritRarity(game.spirits[id]))
    .filter(Boolean)
  await render(e, 'spirit/hero-spirits', { heroId, heroName, spirits }, ATLAS_CFG)
}

async function resolveSpiritAtlas(e, query) {
  const heroName = parseSpiritHeroQuery(query)
  if (!heroName) return false
  const ids = game.getSpiritIdsByHeroSpiritQuery(query)
  if (!ids.length) {
    if (!game.getHeroId(heroName)) {
      return true
    }
    const official = game.heros[game.getHeroId(heroName)]?.name
    await e.reply(`未找到【${official}】的相关灵子`)
    return true
  }
  const heroId = game.getHeroId(heroName)
  const official = game.heros[heroId]?.name || heroName
  if (ids.length === 1) {
    await spiritAtlas(e, ids[0])
  } else {
    await spiritHeroSpiritsAtlas(e, heroId, official, ids)
  }
  return true
}

export const Atlas = plugin({
    name: '[悠悠助手]图鉴',
    event: 'message',
    priority: 100,
    rule: [
        {
            reg: `^#?更新(图鉴|数据|图鉴数据)$`,
            fnc: updateAtlas
        },
        {
            reg: `^#?(?!更新)(.{1,10}?)(图鉴|卡片|card|Card)$`,
            fnc: atlas
        },
        {
            reg: `^#?(?!更新)(.{1,10}?)(专武图鉴|专属灵子图鉴|专武|专属灵子)$`,
            fnc: spiritHeroAtlas
        },
        {
            reg: `^#?(.{1,10}?)((?:技能|星赐|台词|语音|文本)[\n+,，、]?)+(图鉴)?$`,
            fnc: heroInfo
        },
        {
            reg: `^#?(角色列表|全部角色|所有角色|角色图鉴)$`,
            fnc: heroList
        },
        {
            reg: `^#?(奇波列表|全部奇波|所有奇波|奇波图鉴)$`,
            fnc: petList
        },
        {
            reg: `^#?(灵子列表|全部灵子|所有灵子|灵子图鉴)$`,
            fnc: spiritList
        },
        {
            reg: `^#?(物品列表|全部物品|所有物品|物品图鉴)(\\d+)?$`,
            fnc: itemList
        },
        {
            reg: `^#?(装备列表|全部装备|装备图鉴)$`,
            fnc: accessoryList
        },
        {
            reg: `^#?(套装图鉴|套装列表|全部套装)$`,
            fnc: suitList
        },
    ]
})

const RESOLVERS = [
    { names: ['角色'], list: heroList },
    { names: ['奇波', '宠物'], list: petList },
    { names: ['灵子'], list: spiritList },
    { names: ['物品'], list: itemList },
    { names: ['装备'], list: accessoryList },
    { names: ['套装'], list: suitList },
    { getId: name => game.getHeroId(name), atlas: heroAtlas },
    { getId: name => game.getPetId(name), atlas: petAtlas },
    { getId: name => game.getSpiritId(name), atlas: spiritAtlas },
    { getId: name => game.getItemId(name), atlas: itemAtlas },
    { getId: name => game.getAccessoryId(name), atlas: accessoryAtlas },
]

async function atlas(e, atlasName) {
    for (const { names, list } of RESOLVERS) {
        if (names?.includes(atlasName)) return list(e)
    }
    if (parseSpiritHeroQuery(atlasName)) {
        return resolveSpiritAtlas(e, atlasName)
    }
    for (const { getId, atlas: atlasFn } of RESOLVERS) {
        if (!getId) continue
        const id = getId(atlasName)
        if (!id) continue
        if (atlasFn === heroAtlas) return heroAtlas(e, id, ['skill', 'talent'], { showIntro: true })
        return atlasFn(e, id)
    }
    return true
}

async function spiritHeroAtlas(e, heroPart, suffix) {
    return resolveSpiritAtlas(e, heroPart + suffix)
}

async function heroList(e) {
    let heroList = Object.values(game.heros)
    heroList.sort((a, b) => Number(a.id) - Number(b.id))
    heroList.sort((a, b) => (b.rarityStars || 0) - (a.rarityStars || 0))
    await render(e, 'hero/list', { heros: heroList }, ATLAS_CFG)
}

async function heroInfo(e, name) {
    let heroId = game.getHeroId(name)
    if (!heroId) return true
    let type = []
    if (e.msg.includes('技能')) type.push('skill')
    if (e.msg.includes('星赐')) type.push('talent')
    if (e.msg.includes('语音') || e.msg.includes('台词') || e.msg.includes('文本')) type.push('voice')
    await heroAtlas(e, heroId, type)
}

async function heroAtlas(e, heroId, type = ['skill', 'talent'], { showIntro = false } = {}) {
    const hero = game.heros[heroId]
    await render(e, 'hero/atlas', {
        ...hero,
        portraitIcon: hero.portraitIcon || `tex_icon_hero_get_${heroId}.png`,
        type,
        showIntro,
    }, ATLAS_CFG)
}

async function petList(e) {
    let pets = game.getPublicPets()
    pets.sort((a, b) => Number(a.id) - Number(b.id))
    await render(e, 'pet/list', { pets, length: pets.length }, ATLAS_CFG)
}

async function petAtlas(e, petId) {
    const pet = game.pets[petId]
    if (!game.isPublicPet(pet)) return true
    await render(e, 'pet/atlas', { ...pet }, ATLAS_CFG)
}

async function spiritList(e) {
    let spirits = Object.values(game.spirits).map(enrichSpiritRarity)
    spirits.sort((a, b) => Number(a.id) - Number(b.id))
    spirits.sort((a, b) => (b.rarityStars || 0) - (a.rarityStars || 0))
    await render(e, 'spirit/list', { spirits, length: spirits.length }, ATLAS_CFG)
}

async function spiritAtlas(e, spiritId) {
    await render(e, 'spirit/atlas', enrichSpiritRarity(game.spirits[spiritId]) || {}, ATLAS_CFG)
}

async function itemList(e) {
    const page = parseItemListPage(e)
    let items = Object.values(game.items)
    items.sort((a, b) => Number(a.id) - Number(b.id))
    const total = items.length
    const totalPages = Math.max(1, Math.ceil(total / ITEM_LIST_PAGE_SIZE))
    if (page > totalPages) {
        await e.reply(`物品图鉴共 ${totalPages} 页，请输入 1~${totalPages}`)
        return
    }
    const start = (page - 1) * ITEM_LIST_PAGE_SIZE
    const pageItems = items.slice(start, start + ITEM_LIST_PAGE_SIZE)
    await render(e, 'item/list', {
        items: pageItems,
        length: total,
        page,
        totalPages,
        pageSize: ITEM_LIST_PAGE_SIZE,
        nextPage: page < totalPages ? page + 1 : null,
        prevPage: page > 1 ? page - 1 : null,
    }, ATLAS_CFG)
}

async function itemAtlas(e, itemId) {
    await render(e, 'item/atlas', game.items[itemId] || {}, ATLAS_CFG)
}

async function accessoryList(e) {
    await render(e, 'accessory/list', {
        accessories: Object.values(game.accessories).sort((a, b) => (b.rarity || 0) - (a.rarity || 0))
    }, ATLAS_CFG)
}

function resolveRelatedPet(petName) {
    if (!petName) return { relatedPetIcon: null, relatedPetName: '' }
    let pet = null
    const petId = game.getPetId(petName)
    if (petId) pet = game.pets[petId]
    if (!pet) {
        pet = game.getPublicPets().find(p => p.name === petName || p.page === petName)
    }
    return {
        relatedPetIcon: pet?.petIcon || null,
        relatedPetName: pet?.name || petName,
    }
}

async function accessoryAtlas(e, accessoryId) {
    const accessory = game.enrichAccessoryAtlas(game.getAccessory(accessoryId))
    if (!accessory) return true
    const { relatedPetIcon, relatedPetName } = resolveRelatedPet(accessory.relatedPet)
    await render(e, 'accessory/atlas', {
        ...accessory,
        relatedPetIcon,
        relatedPetName,
        maxEnhance: (accessory.rarityClass || 0) * 3,
    }, ATLAS_CFG)
}

async function suitList(e) {
    const suits = game.getSuitSets()
    await render(e, 'accessory/suit-list', {
        suits,
        length: suits.length,
    }, ATLAS_CFG)
}

async function updateAtlas(e) {
    try {
        e.reply('即将为你更新数据~')
        await game.getData({ mode: 'refresh' })
        e.reply('数据已更新完毕！')
    } catch (error) {
        logger.error('[yoyo-plugin][updateAtlas]', error)
        e.reply('数据更新失败，请查看日志')
    }
}
