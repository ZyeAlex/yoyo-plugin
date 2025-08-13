import setting from '#setting'
import render from '#render'
import lodash from 'lodash'
export class Hero extends plugin {
    constructor() {
        super({
            name: '[悠悠小助手]角色',
            dsc: '悠悠角色',
            event: 'message',
            priority: 101,
            rule: [
                {
                    reg: `^${setting.rulePrefix}?(角色列表|全部角色|所有角色)$`,
                    fnc: 'heroList'
                },
                {
                    reg: `^${setting.rulePrefix}?.{1,10}设置(别名|昵称|称号|外号).{1,10}$`,
                    fnc: 'setNickname'
                },
                {
                    reg: `^${setting.rulePrefix}?.{1,10}删除(别名|昵称|称号|外号).{1,10}$`,
                    fnc: 'delNickname'
                },
                {
                    reg: `^${setting.rulePrefix}?设置老婆.{1,10}$`,
                    fnc: 'setWife'
                },
                {
                    reg: `^${setting.rulePrefix}?删除老婆.{1,10}$`,
                    fnc: 'delWife'
                },
            ]
        })
    }
    // 角色列表
    async heroList(e) {

        let heroList = Object.entries(setting.heros)

        heroList.sort(([_, { rarity = 0 }], [__, { rarity: rarity2 = 0 }]) => rarity2 - rarity)
        return await render(e, 'hero/list', {
            heroImg: lodash.sample(setting.getHeroImgs(lodash.sample(heroList[0])))?.split('/resources')[1],
            heros: heroList.map(([heroName, heroMsg]) => {
                let obj = {
                    heroName,
                    heroImg: lodash.sample(setting.getHeroImgs(heroName))?.split('/resources')[1],
                    ...heroMsg
                }
                return obj
            })
        })
    }
    // 设置角色别名
    setNickname(e) {
        let [_, heroName, nickname] = e.msg.match(new RegExp(`^${setting.rulePrefix}?(.{1,10})设置(?:别名|昵称|称号|外号)(.{1,10})$`))
        heroName = setting.getHeroName(heroName)
        if (!heroName) {
            return e.reply('未找到此角色')
        }
        if (nickname.length > 10) {
            return e.reply('昵称长度不能超过10位！')
        }
        const res = setting.setHeroNickname(heroName, nickname)
        return e.reply(res ? '别名设置成功' : '别名设置失败')
    }
    // 删除角色别名
    delNickname(e) {
        let [_, heroName, nickname] = e.msg.match(new RegExp(`^${setting.rulePrefix}?(.{1,10})删除(?:别名|昵称|称号|外号)(.{1,10})$`))
        heroName = setting.getHeroName(heroName)
        if (!heroName) {
            return e.reply('未找到此角色')
        }
        return e.reply(setting.delHeroNickname(heroName, nickname))
    }
    // 设置老婆
    setWife(e) {

    }
    // 删除老婆
    delWife(e) {

    }
}