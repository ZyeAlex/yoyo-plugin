import setting from '#setting'
import plugin from '#plugin'
import render from '#render'
import lodash from 'lodash'

export default plugin({
    name: '[悠悠助手]角色',
    event: 'message',
    priority: 101,
    rule: [
        {
            reg: `^${setting.rulePrefix}?.{1,10}设置(别名|昵称|称号|外号).{1,10}$`,
            fnc: setNickname
        },
        {
            reg: `^${setting.rulePrefix}?.{1,10}删除(别名|昵称|称号|外号).{1,10}$`,
            fnc: delNickname
        }
    ]
})

function setNickname(e) {
    let [_, heroName, nickname] = e.msg.match(new RegExp(`^${setting.rulePrefix}?(.{1,10}?)设置(?:别名|昵称|称号|外号)(.{1,10}?)$`))
    let heroId = setting.getHeroId(heroName)
    if (!heroId) {
        return e.reply('未找到此角色')
    }
    if (nickname.length > 10) {
        return e.reply('昵称长度不能超过10位！')
    }
    const res = setting.setHeroNickname(heroId, nickname)
    return e.reply(res ? '别名设置成功' : '别名设置失败')
}

function delNickname(e) {
    let [_, heroName, nickname] = e.msg.match(new RegExp(`^${setting.rulePrefix}?(.{1,10}?)删除(?:别名|昵称|称号|外号)(.{1,10}?)$`))
    let heroId = setting.getHeroId(heroName)
    if (!heroId) {
        return e.reply('未找到此角色')
    }
    return e.reply(setting.delHeroNickname(heroId, nickname))
}
