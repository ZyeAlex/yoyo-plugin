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
            reg: `^${setting.rulePrefix}?(?:(.{1,10}?)设置|设置(.{1,10}?))(?:别名|昵称|称号|外号)(.{1,10}?)$`,
            log: false,
            fnc: setNickname
        },
        {
            reg: `^${setting.rulePrefix}?(?:(.{1,10}?)删除|删除(.{1,10}?))(?:别名|昵称|称号|外号)(.{1,10}?)$`,
            log: false,
            fnc: delNickname
        },
        {
            reg: `^${setting.rulePrefix}?(?:查看)?(.{1,10}?)(?:查看)?(?:别名|昵称|称号|外号)$`,
            log: false,
            fnc: getNickname
        },
    ]
})

function setNickname(e, reg) {
    let [_, heroName1, heroName2, nickname] = e.msg.match(reg)
    let heroId = setting.getHeroId(heroName1 || heroName2)
    if (!heroId) {
        return e.reply('未找到此角色')
    }
    if (nickname.length > 10) {
        return e.reply('昵称长度不能超过10位！')
    }


    if (!setting.nicknames[heroId]) {
        setting.nicknames[heroId] = []
    }
    if (!setting.nicknames[heroId].includes(nickname)) {
        setting.nicknames[heroId].push(nickname)
    }
    const res = setting.setData('data/hero/nickname', setting.nicknames)

    return e.reply(res ? '别名设置成功' : '别名设置失败')
}

function delNickname(e, reg) {
    let [_, heroName1, heroName2, nickname] = e.msg.match(reg)
    let heroId = setting.getHeroId(heroName1 || heroName2)
    if (!heroId) {
        return e.reply('未找到此角色')
    }

    if (!setting.nicknames[heroId]) {
        return '该角色没有此别名'
    }
    if (setting.nicknames[heroId].includes(nickname)) {
        setting.nicknames[heroId].splice(setting.nicknames[heroId].indexOf(nickname), 1)
    }
    const res = setting.setData('data/hero/nickname', setting.nicknames)


    e.reply(res ? '删除别名成功' : '删除别名失败')
}

async function getNickname(e, reg) {
    let [_, heroName] = e.msg.match(reg)
    let heroId = setting.getHeroId(heroName)
    let heroMsg = setting.heros[heroId] || {}
    await render(e, 'hero/atlas', {
        ...heroMsg,
        nicknames: setting.nicknames[heroId],
        type: ['nickname']
    }, { origin: '群友上传' })
}