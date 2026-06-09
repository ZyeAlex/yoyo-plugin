import game from '#game'
import render from '#render'
import plugin from '#plugin'

const ATLAS_CFG = { origin: 'BWiki' }

export const Atlas = plugin({
    name: '[悠悠助手]图鉴',
    event: 'message',
    priority: 100,
    rule: [
        {
            reg: `^#?更新(.{0,4})(图鉴|数据|图鉴数据)$`,
            fnc: updateAtlas
        },
        {
            reg: `^#?(?!更新)(.{1,10}?)(图鉴|卡片|card|Card)$`,
            fnc: atlas
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
            reg: `^#?(物品列表|全部物品|所有物品|物品图鉴)$`,
            fnc: itemList
        },
        {
            reg: `^#?(装备列表|全部装备|装备图鉴)$`,
            fnc: accessoryList
        },
    ]
})

const RESOLVERS = [
    { names: ['角色'], list: heroList },
    { names: ['奇波', '宠物'], list: petList },
    { names: ['灵子'], list: spiritList },
    { names: ['物品'], list: itemList },
    { names: ['装备'], list: accessoryList },
    { getId: name => game.getHeroId(name), atlas: heroAtlas },
    { getId: name => game.getPetId(name), atlas: petAtlas },
    { getId: name => game.getSpiritId(name), atlas: spiritAtlas },
    { getId: name => game.getItemId(name), atlas: itemAtlas },
]

function atlas(e, atlasName) {
    for (const { names, list } of RESOLVERS) {
        if (names?.includes(atlasName)) return list(e)
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
    let pets = Object.values(game.pets).filter(({ petIcon, name }) => petIcon && String(name || '').trim())
    pets.sort((a, b) => Number(a.id) - Number(b.id))
    await render(e, 'pet/list', { pets, length: pets.length }, ATLAS_CFG)
}

async function petAtlas(e, petId) {
    await render(e, 'pet/atlas', { ...game.pets[petId] }, ATLAS_CFG)
}

async function spiritList(e) {
    let spirits = Object.values(game.spirits)
    spirits.sort((a, b) => Number(a.id) - Number(b.id))
    await render(e, 'spirit/list', { spirits, length: spirits.length }, ATLAS_CFG)
}

async function spiritAtlas(e, spiritId) {
    await render(e, 'spirit/atlas', game.spirits[spiritId] || {}, ATLAS_CFG)
}

async function itemList(e) {
    let items = Object.values(game.items)
    items.sort((a, b) => Number(a.id) - Number(b.id))
    await render(e, 'item/list', { items, length: items.length }, ATLAS_CFG)
}

async function itemAtlas(e, itemId) {
    await render(e, 'item/atlas', game.items[itemId] || {}, ATLAS_CFG)
}

async function accessoryList(e) {
    await render(e, 'accessory/list', {
        accessories: Object.values(game.accessories).sort((a, b) => (b.rarity || 0) - (a.rarity || 0))
    }, ATLAS_CFG)
}

async function updateAtlas(e, type) {
    try {
        e.reply('即将为你更新图鉴数据~')
        const typeMap = {
            '角色': 'Hero',
            '奇波': 'Kibo',
            '灵子': 'Spirit',
            '装备': 'Accessory',
            '物品': 'Item',
        }
        if (!type) await game.getData({ mode: 'refresh' })
        else if (typeMap[type]) await game.getData({ mode: 'refresh', type: typeMap[type] })
        else await game.getData({ mode: 'refresh' })
        e.reply((type || '') + '图鉴数据已更新完毕！')
    } catch (error) {
        logger.error('[yoyo-plugin][updateAtlas]', error)
        e.reply('图鉴数据更新失败，请查看日志')
    }
}
