import setting from '#setting'
import render from '#render'
import lodash from 'lodash'
import plugin from '#plugin'
// type   skill voice
export const Atlas = plugin({
    name: '[悠悠助手]图鉴',
    event: 'message',
    priority: -1,
    rule: [
        {
            reg: `^${setting.rulePrefix}?(.{1,10}?)(图鉴|卡片|card|Card)$`,
            fnc: atlas
        },
        {
            reg: `^${setting.rulePrefix}?(.{1,10}?)((?:技能|星赐|台词|语音|文本)[\n+,，、]?)+(图鉴)?$`,
            fnc: heroInfo
        },
        {
            reg: `^${setting.rulePrefix}?(角色列表|全部角色|所有角色)$`,
            fnc: heroList
        },
        {
            reg: `^${setting.rulePrefix}?(奇波列表|全部奇波|所有奇波|奇波图鉴)$`,
            fnc: petList
        },
        {
            reg: `^${setting.rulePrefix}?(装备列表|全部装备)$`,
            fnc: accessoryList
        },
        {
            reg: `^${setting.rulePrefix}?(成就列表|全部成就)$`,
            fnc: achievementList
        },
        {
            reg: `^${setting.rulePrefix}?(建造列表|全部建造)$`,
            fnc: buildingList
        },
        {
            reg: `^${setting.rulePrefix}?(料理|食物|食品)列表|全部(料理|食物|食品)$`,
            fnc: foodList
        }
    ]
})

function atlas(e, reg) {
    // 名称
    let atlasName = e.msg.match(reg)[1]

    if (atlasName == '角色') {
        return heroList(e)
    }
    if (atlasName == '奇波' || atlasName == '宠物') {
        return petList(e)
    }
    if (atlasName == '装备') {
        return accessoryList(e)
    }
    if (atlasName == '成就') {
        return achievementList(e)
    }
    if (atlasName == '建造') {
        return buildingList(e)
    }
    if (atlasName == '食品' || atlasName == '食物' || atlasName == '料理') {
        return foodList(e)
    }
    let heroId = setting.getHeroId(atlasName,false)
    // 角色
    if (heroId) {
        return heroAtlas(e, heroId)
    }
    // 奇波
    if (setting.petIds[atlasName]) {
        return petAtlas(e, setting.petIds[atlasName])
    }
    return true
}


/**
    * 角色
    */
// 角色图鉴
async function heroList(e) {
    let heroList = Object.values(setting.heros)
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
async function heroInfo(e,reg) {
    let name = e.msg.match(reg)[1]
    let heroId = setting.getHeroId(name)
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

    return heroAtlas(e, heroId, config)
}

// 角色图鉴
async function heroAtlas(e, heroId, type = ['skill', 'talent']) {
    // 角色信息
    let heroMsg = setting.heros[heroId] || {}
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
    let pets = Object.values(setting.pets)
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
    let pet = { ...setting.pets[petId] }
    pet.evolution = (setting.pets[petId].evolution || []).map(petId => {
        return setting.pets[petId]
    })
    return await render(e, 'pet/atlas', pet, { origin: 'BWiki' })
}
/**
 * 装备
 */
//   装备图鉴
async function accessoryList(e) {
    await render(e, 'accessory/list', {
        accessories: setting.accessories.filter(({ name }) => name != '暂未开放')
    })
}
/**
 * 成就
 */
// 装备图鉴
async function achievementList(e) {
    await render(e, 'achievement/list', {
        num: setting.achievements.reduce((num, { achievement }) => num += achievement.length, 0),
        achievements: setting.achievements
    })
}
/**
 * 食物
 */
// 食品列表
async function foodList(e) {
    await render(e, 'food/list', {
        foods: setting.foods
    })
}
/**
 * 建造
 */
//   建造列表
async function buildingList(e) {
    await render(e, 'building/list', {
        buildings: setting.buildings.filter(building => building?.building?.[0]?.buildingPixelIcon)
    })
}