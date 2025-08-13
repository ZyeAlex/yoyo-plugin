import setting from '#setting'
import render from '#render'
import lodash from 'lodash'
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
        let name = e.msg.match(new RegExp(`^${setting.rulePrefix}?(.{1,10})(角色|奇波)?(图鉴|卡片|card|Card)$`))[1]
        logger.info(name, setting.getHeroName(name))
        // 角色
        if (setting.getHeroName(name)) {
            return this.heroAtlas(e, setting.getHeroName(name))
        }
        // 奇波
        if (setting.pets[name]) {
            return this.petAtlas(e, name)
        }
        return true
    }
    // 角色图鉴
    async heroAtlas(e, heroName) {
        // 角色图片
        let heroImg = lodash.sample(setting.getHeroImgs(heroName))
        if (heroImg) {
            heroImg = heroImg.split('/resources')[1]
        } else {
            heroImg = ''
        }
        // 角色信息
        let heroMsg = setting.heros[heroName] || {}
        return await render(e, 'hero/atlas', {
            heroName,
            heroImg,
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