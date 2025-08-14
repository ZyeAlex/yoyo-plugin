import setting from '#setting'
import render from '#render'
import lodash from 'lodash'
import avatar from '../resources/img/hero/HeroHalfs.js'

export class Pet extends plugin {
    constructor() {
        super({
            name: '[悠悠小助手]图鉴',
            dsc: '悠悠图鉴',
            event: 'message',
            priority: 102,
            rule: [
                {
                    reg: `^${setting.rulePrefix}?.{1,10}(图鉴|卡片|card|Card)$`,
                    fnc: 'atlas'
                },
            ]
        })
    }

    atlas(e) {
        // 名称
        let name = e.msg.match(new RegExp(`^${setting.rulePrefix}?(.{1,10})(角色|奇波)?(图鉴|卡片|card|Card)(列表)?$`))[1]
        let heroId = setting.getHeroId(name)
        // 角色
        if (heroId) {
            return this.heroAtlas(e, heroId)
        }
        // 奇波
        if (setting.pets[name]) {
            return this.petAtlas(e, name)
        }
        return true
    }
    // 角色图鉴
    async heroAtlas(e, heroId) {
        // 角色信息
        let heroMsg = setting.heros[heroId] || {}
        return await render(e, 'hero/atlas', {
            avatar: avatar[setting.heros[heroId]['名称']] || avatar['未知'],
            ...heroMsg
        })
    }

    // 奇波卡片
    async petAtlas(e, petName) {
        return await render(e, 'pet/atlas', {
            ...setting.pets[petName]
        })
    }
}