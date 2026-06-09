import { saveRender } from '#render'
import utils from '#utils'
import setting from '#setting'
import game from '#game'
import plugin from '#plugin'
import lodash from 'lodash'

export const Sign = plugin({
    name: '[悠悠助手]签到',
    event: 'message',
    priority: 9999,
    rule: [
        {
            reg: `^#?(签到|打卡)$`,
            fnc: sign
        },
        {
            reg: `^#?更?换个?(今日)?老婆$`,
            fnc: updateSign
        }
    ]
})

function signGroupAllowed(e) {
    if (!e.group_id) return false
    if (setting.config.signInclude?.length && !setting.config.signInclude.includes(e.group_id)) return false
    if (setting.config.signExclude?.length && setting.config.signExclude.includes(e.group_id)) return false
    return true
}

function pickSignHeroId(excludeId) {
    let heros = Object.keys(game.heros).filter(id => id != '199002' && game.heroImgs[id]?.length && id != excludeId)
    return heros.length ? lodash.sample(heros) : null
}

function buildSignRenderData(e, userSignInfo, opts = {}) {
    const heroId = userSignInfo.heroId
    return {
        hasSign: opts.hasSign ?? false,
        updateSign: opts.updateSign ?? false,
        heroImg: lodash.sample(game.heroImgs[heroId]),
        color: game.getHeroThemeColor(heroId),
        xinghong: userSignInfo.xinghong,
        xinghong_sign: opts.xinghong_sign ?? userSignInfo.xinghong_sign,
        heroName: game.heros[heroId]?.name || userSignInfo.heroName,
        username: e.sender.nickname || e.sender.card || '你',
        userIcon: `http://q2.qlogo.cn/headimg_dl?dst_uin=${e.user_id}&spec=5`,
        hisHeros: Object.entries(userSignInfo.history).sort((a, b) => b[1] - a[1]),
        heroNums: Object.keys(userSignInfo.history).length,
        rank: userSignInfo.rank,
        day: Object.values(userSignInfo.history).reduce((a, b) => a + b, 0),
    }
}

async function sign(e) {
    if (!setting.config.sign || !signGroupAllowed(e)) return true

    let userSignInfo = getUserData(e.group_id, e.user_id)
    let today = utils.getDate(new Date(), 'YYYY-MM-DD')
    let hasSign = userSignInfo.date == today

    if (!hasSign) {
        let signRanks = await redis.get('yoyo:sign:rank')
        signRanks = signRanks ? JSON.parse(signRanks) : {}
        signRanks[e.group_id] = signRanks[e.group_id] || [today, 0]
        signRanks[e.group_id] = signRanks[e.group_id][0] == today ? signRanks[e.group_id] : [today, 0]
        signRanks[e.group_id][1]++
        userSignInfo.rank = signRanks[e.group_id][1]
        redis.set('yoyo:sign:rank', JSON.stringify(signRanks))

        userSignInfo.xinghong_sign = 160
        let memeber = (await e.group.getMemberList()).length * 0.05
        if (userSignInfo.rank <= memeber) {
            userSignInfo.xinghong_sign += (memeber - userSignInfo.rank) ^ 1.2
        }
        memeber = Math.max((await e.group.getMemberList()).length * 0.01, 3)
        if (userSignInfo.rank <= memeber) {
            userSignInfo.xinghong_sign += (memeber - userSignInfo.rank) ^ 1.1 * 10
        }
        if (userSignInfo.rank <= 3) {
            userSignInfo.xinghong_sign += (4 - userSignInfo.rank) * 100
        }
        userSignInfo.xinghong_sign = Math.floor(userSignInfo.xinghong_sign)
        userSignInfo.xinghong = (userSignInfo.xinghong || 0) + userSignInfo.xinghong_sign
        userSignInfo.date = today

        if (!Object.keys(game.heros).length) {
            e.reply('角色数据加载中，请稍后重试...')
            return
        }
        const heroId = pickSignHeroId()
        if (!heroId) {
            e.reply('没有可签到的角色图片，请先上传角色图片！\n或参考readme安装图库')
            return
        }
        userSignInfo.heroId = heroId
        userSignInfo.history[game.heros[heroId].name] = (userSignInfo.history[game.heros[heroId].name] || 0) + 1
    }

    saveUserData(e.group_id, e.user_id, userSignInfo)
    const signData = buildSignRenderData(e, userSignInfo, { hasSign })
    await saveRender(e, 'sign/index', signData.heroImg, signData, false, { recallMsg: setting.config.signWithdrawal ? 100 : 0 })
}

async function updateSign(e) {
    if (!signGroupAllowed(e)) return true

    let userSignInfo = getUserData(e.group_id, e.user_id)
    let today = utils.getDate(new Date(), 'YYYY-MM-DD')
    if (userSignInfo.date != today) return true

    if (userSignInfo.xinghong < 160) {
        e.reply('你的星虹数量不足，无法更换今日老婆~')
        return
    }
    userSignInfo.xinghong -= 160

    const prevName = game.heros[userSignInfo.heroId]?.name
    if (prevName) {
        userSignInfo.history[prevName] = (userSignInfo.history[prevName] || 0) - 1
        if (userSignInfo.history[prevName] <= 0) delete userSignInfo.history[prevName]
    }

    const heroId = pickSignHeroId(userSignInfo.heroId)
    if (!heroId) {
        e.reply('没有可签到的角色图片，请先上传角色图片！\n或参考readme安装图库')
        return
    }
    userSignInfo.heroId = heroId
    userSignInfo.history[game.heros[heroId].name] = (userSignInfo.history[game.heros[heroId].name] || 0) + 1

    saveUserData(e.group_id, e.user_id, userSignInfo)
    const signData = buildSignRenderData(e, userSignInfo, { updateSign: true, xinghong_sign: -160 })
    await saveRender(e, 'sign/index', signData.heroImg, signData, false, { recallMsg: setting.config.signWithdrawal ? 100 : 0 })
}

let groupData = {}
const getUserData = (group_id, user_id) => {
    if (!groupData[group_id]) {
        groupData[group_id] = setting.getData('data/group/' + group_id + '/others', {}, 'yunzai')
    }
    let userData = groupData[group_id][user_id] || { history: {} }
    if (!userData.history) userData.history = {}
    return userData
}

const saveUserData = (group_id, user_id, userSignList) => {
    if (!groupData[group_id]) {
        groupData[group_id] = setting.getData('data/group/' + group_id + '/others', {}, 'yunzai')
    }
    groupData[group_id][user_id] = userSignList
    setting.setData('data/group/' + group_id + '/others', groupData[group_id], 'yunzai')
}
