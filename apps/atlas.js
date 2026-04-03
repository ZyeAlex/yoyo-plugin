import game from '#game'
import render from '#render'
import plugin from '#plugin'
// type   skill voice
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
            reg: `^#?(角色列表|全部角色|所有角色)$`,
            fnc: heroList
        },
        {
            reg: `^#?(奇波列表|全部奇波|所有奇波|奇波图鉴)$`,
            fnc: petList
        },
        {
            reg: `^#?(套装列表|全部套装)$`,
            fnc: setList
        },
        {
            reg: `^#?(装备列表|全部装备)$`,
            fnc: accessoryList
        },
    ]
})

function atlas(e, atlasName) {
    if (atlasName == '角色') {
        return heroList(e)
    }
    if (atlasName == '奇波' || atlasName == '宠物') {
        return petList(e)
    }
    if (atlasName == '套装') {
        return setList(e)
    }
    if (atlasName == '装备') {
        return accessoryList(e)
    }
    let heroId = game.getHeroId(atlasName, false)
    // 角色
    if (heroId) {
        return heroAtlas(e, heroId)
    }
    // 奇波
    if (game.petIds[atlasName]) {
        return petAtlas(e, game.petIds[atlasName])
    }
    return true
}


/**
    * 角色
    */
// 角色图鉴
async function heroList(e) {
    let heroList = Object.values(game.heros)
    heroList.sort((a, b) => a.id - b.id).sort((a, b) => (b.rarity?.id || 0) - (a.rarity?.id || 0)).sort((a) => {
        if (a.state == 1) return -1
        if (a.state == 2 || a.state == 3) return 1
        return 0
    })
    await render(e, 'hero/list', {
        heros: heroList
    })
}
// 角色信息
async function heroInfo(e, name) {
    let heroId = game.getHeroId(name)
    if (!heroId) return true
    let config = []

    // 如果reg包含 技能
    // 如果reg 包含技能文本

    if (e.msg.includes('技能')) {
        config.push('skill')
    }
    if (e.msg.includes('星赐')) {
        config.push('talent')
    }
    // 台词|语音|文本
    if (e.msg.includes('语音') || e.msg.includes('台词') || e.msg.includes('文本')) {
        config.push('voice')
    }

    await heroAtlas(e, heroId, config)
}

// 角色图鉴
async function heroAtlas(e, heroId, type = ['skill', 'talent']) {
    // 角色信息
    let heroMsg = game.heros[heroId] || {}
    await render(e, 'hero/atlas', {
        ...heroMsg,
        type
    }, { origin: 'BWiki' })
}
/**
 * 奇波
 */
// 奇波图鉴
async function petList(e) {
    let pets = Object.values(game.pets)
    pets = pets.filter(({ petIcon }) => petIcon)
    pets.sort((a, b) => a.iconographyNum - b.iconographyNum)
    await render(e, 'pet/list', {
        pets: pets.map(pet => {
            return pet
        }),
        length: pets.length
    }, { origin: 'BWiki' })
}
// 奇波图鉴
async function petAtlas(e, petId) {
    let pet = { ...game.pets[petId] }
    pet.evolution = (game.pets[petId].evolution || []).map(petId => {
        return game.pets[petId]
    })
    await render(e, 'pet/atlas', pet, { origin: 'BWiki' })
}
/**
 * 装备
 */
async function setList(e) {
    await render(e, 'accessory/set-list', {
        sets: Object.values(game.sets)
    })
}
//   装备图鉴
async function accessoryList(e) {
    await render(e, 'accessory/list', {
        accessories: Object.values(game.accessories).filter(({ name }) => name != '暂未开放').sort((a, b) => b.rarity - a.rarity)
    })
}

async function updateAtlas(e, type) {
    try {
        e.reply('即将为你更新图鉴数据~')
        if (!type) await game.getData()
        else if (type == '角色') await game.getData(false, 'Hero')
        else if (type == '奇波') await game.getData(false, 'Kibo')
        else if (type == '装备') await game.getData(false, 'Accessory')
        e.reply((type || '') + '图鉴数据已更新完毕！')
    } catch (error) {

    }
}