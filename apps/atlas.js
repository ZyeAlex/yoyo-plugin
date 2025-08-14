import setting from '#setting'
import render from '#render'
import lodash from 'lodash'
import avatar from '../resources/img/hero/HeroHalfs.js'
import style from '../data/style.js'
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
        heroMsg['牵绊']?.forEach((item)=>{
            item['台词内容'] = item['台词内容']?.replace(/\n/g, "<br/>&ensp;&ensp;")
        })
        heroMsg['台词'] = Object.entries(heroMsg['台词']).reduce((s, [name, discibe]) => {
            s[name] = discibe?.replace(/\n/g, "<br/>&ensp;&ensp;")
            return s
        }, {})
        heroMsg['技能'] = Object.entries(heroMsg['技能']).reduce((s, [name, discibe]) => {
            s[name] = discibe?.replace(/\n/g, "<br/>&ensp;&ensp;")
            .replace(/(.)属性(物理|魔法)?伤害/, (_, a, b) => {
                return `<span style="color:${style[a]}">${a}属性${b}伤害</span>`
            })
            return s
        }, {})
        return await render(e, 'hero/atlas', {
            avatar: avatar[setting.heros[heroId]['名称']] || avatar['未知'],
            ...heroMsg,
        })
    }

    // 奇波卡片
    async petAtlas(e, petName) {
        return await render(e, 'pet/atlas', {
            ...setting.pets[petName]
        })
    }
}