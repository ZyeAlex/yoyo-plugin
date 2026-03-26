import setting from '#setting'
import game from '#game'
import plugin from '#plugin'
import render from '#render'
import lodash from 'lodash'

export default plugin({
    name: '[悠悠助手]角色',
    event: 'message',
    priority: 100,
    rule: [
        {
            reg: `^#?(?:(.{1,10}?)设置|设置(.{1,10}?))(?:别名|昵称|称号|外号)(.{1,10}?)$`,
            log: false,
            fnc: setNickname
        },
        {
            reg: `^#?(?:(.{1,10}?)删除|删除(.{1,10}?))(?:别名|昵称|称号|外号)(.{1,10}?)$`,
            log: false,
            fnc: delNickname
        },
        {
            reg: `^#?(?:查看)?(.{1,10}?)(?:查看)?(?:别名|昵称|称号|外号)$`,
            log: false,
            fnc: getNickname
        },
    ]
})

function setNickname(e, heroName1, heroName2, nickname) {
    let heroId = game.getHeroId(heroName1 || heroName2)
    if (!heroId) return true
    if (nickname.length > 10) {
        e.reply('昵称长度不能超过10位！')
        return
    }


    if (!game.nicknames[heroId]) {
        game.nicknames[heroId] = []
    }
    if (!game.nicknames[heroId].includes(nickname)) {
        game.nicknames[heroId].push(nickname)
    }
    const res = setting.setData('data/hero/nickname', game.nicknames)

    e.reply(res ? '别名设置成功' : '别名设置失败')
}

function delNickname(e, heroName1, heroName2, nickname) {
    let heroId = game.getHeroId(heroName1 || heroName2)
    if (!heroId) {
        e.reply('未找到此角色')
        return
    }

    if (!game.nicknames[heroId]) {
        e.reply('该角色没有此别名')
        return 
    }
    if (game.nicknames[heroId].includes(nickname)) {
        game.nicknames[heroId].splice(game.nicknames[heroId].indexOf(nickname), 1)
    }
    const res = setting.setData('data/hero/nickname', game.nicknames)


    e.reply(res ? '删除别名成功' : '删除别名失败')
}

async function getNickname(e, heroName) {
    let heroId = game.getHeroId(heroName)
    if (!heroId) return true
    let heroMsg = game.heros[heroId] || {}
    await render(e, 'hero/atlas', {
        ...heroMsg,
        nicknames: game.nicknames[heroId],
        type: ['nickname']
    }, { origin: '群友上传' })
}
