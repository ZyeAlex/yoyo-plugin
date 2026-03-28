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


async function sign(e) {
    // 签到过滤
    if (
        !setting.config.sign ||
        setting.config.signInclude?.length && !setting.config.signInclude.includes(e.group_id) ||
        setting.config.signExclude?.length && setting.config.signExclude.includes(e.group_id) ||
        !e.group_id) return true
    let userSignInfo = getUserData(e.group_id, e.user_id)
    // 今日是否签到
    let hasSign = false
    // 今日日期
    let today = utils.formatDate(new Date(), 'YYYY-MM-DD')

    if (userSignInfo.date == today) {
        hasSign = true
    } else {
        // 签到排名
        let signRanks = await redis.get('yoyo:sign:rank')
        signRanks = signRanks ? JSON.parse(signRanks) : {}
        signRanks[e.group_id] = signRanks[e.group_id] || [today, 0]
        signRanks[e.group_id] = signRanks[e.group_id][0] == today ? signRanks[e.group_id] : [today, 0]
        signRanks[e.group_id][1]++
        userSignInfo.rank = signRanks[e.group_id][1]
        redis.set('yoyo:sign:rank', JSON.stringify(signRanks))
        // 签到领星虹
        userSignInfo.xinghong_sign = 160
        // 前5%加成
        let memeber = (await e.group.getMemberList()).length * 0.05
        if (userSignInfo.rank <= memeber) {
            userSignInfo.xinghong_sign += (memeber - userSignInfo.rank) ^ 1.2
        }
        // 前1%加成
        memeber = Math.max((await e.group.getMemberList()).length * 0.01, 3)
        if (userSignInfo.rank <= memeber) {
            userSignInfo.xinghong_sign += (memeber - userSignInfo.rank) ^ 1.1 * 10
        }
        // 前3加成
        if (userSignInfo.rank <= 3) {
            userSignInfo.xinghong_sign += (4 - userSignInfo.rank) * 100
        }
        userSignInfo.xinghong_sign = Math.floor(userSignInfo.xinghong_sign)
        userSignInfo.xinghong = (userSignInfo.xinghong || 0) + userSignInfo.xinghong_sign
        // 签到日期
        userSignInfo.date = today
        // 用户信息 排除男主角 排除没有图像的角色
        let heros = Object.keys(game.heros).filter(id => id != '199002' && game.heroImgs[id]?.length)
        if (!Object.keys(game.heros).length) {
            e.reply('角色数据加载中，请稍后重试...')
            return
        }
        if (!heros?.length) {
            e.reply('没有可签到的角色图片，请先上传角色图片！\n或参考readme安装图库')
            return
        }
        userSignInfo.heroId = lodash.sample(heros)
        userSignInfo.history[game.heros[userSignInfo.heroId].name] = (userSignInfo.history[game.heros[userSignInfo.heroId].name] || 0) + 1
    }
    // 保存签到数据
    saveUserData(e.group_id, e.user_id, userSignInfo)
    // 发送签到数据
    let signData = {
        hasSign,
        heroImg: lodash.sample(game.heroImgs[userSignInfo.heroId]),
        color: game.heros[userSignInfo.heroId]?.element?.elementColor || '#000000',
        xinghong: userSignInfo.xinghong,
        xinghong_sign: userSignInfo.xinghong_sign,
        heroName: game.heros[userSignInfo.heroId]?.name || userSignInfo.heroName,
        username: e.sender.nickname || e.sender.card || '你',
        userIcon: `http://q2.qlogo.cn/headimg_dl?dst_uin=${e.user_id}&spec=5`,
        hisHeros: Object.entries(userSignInfo.history).sort((a, b) => b[1] - a[1]),
        heroNums: Object.keys(userSignInfo.history).length,
        rank: userSignInfo.rank,
        day: Object.values(userSignInfo.history).reduce((a, b) => a + b),
    }
    await saveRender(e, 'sign/index', signData.heroImg, signData, false, { recallMsg: setting.config.signWithdrawal ? 100 : 0 })
}

async function updateSign(e) {
    if (!e.group_id) return true
    // 签到过滤
    if (setting.config.signInclude?.length && !setting.config.signInclude.includes(e.group_id) || setting.config.signExclude?.length && setting.config.signExclude.includes(e.group_id)) return true
    // 用户签到数据
    let userSignInfo = game.getUserData(e.group_id, e.user_id)
    // 今日日期
    let today = utils.formatDate(new Date(), 'YYYY-MM-DD')
    if (userSignInfo.date == today) {
        if (userSignInfo.xinghong < 160) {
            e.reply('你的星虹数量不足，无法更换今日老婆~')
            return
        }
        userSignInfo.xinghong -= 160
        // 用户信息 排除男主角 排除没有图像的角色
        let heros = Object.keys(game.heros).filter(id => id != '199002' && game.heroImgs[id]?.length)
        if (!heros?.length) {
            return e.reply('没有可签到的角色图片，请先上传角色图片！\n或参考readme安装图库')
        }
        userSignInfo.history[game.heros[userSignInfo.heroId].name] = (userSignInfo.history[game.heros[userSignInfo.heroId].name] || 0) - 1
        if (userSignInfo.history[game.heros[userSignInfo.heroId].name] <= 0) {
            delete userSignInfo.history[game.heros[userSignInfo.heroId].name]
        }
        userSignInfo.heroId = lodash.sample(heros)
        userSignInfo.history[game.heros[userSignInfo.heroId].name] = (userSignInfo.history[game.heros[userSignInfo.heroId].name] || 0) + 1
    }
    // 保存签到数据
    game.saveUserData(e.group_id, e.user_id, userSignInfo)
    // 发送签到数据
    let signData = {
        updateSign: true,
        heroImg: lodash.sample(game.heroImgs[userSignInfo.heroId]),
        color: game.heros[userSignInfo.heroId]?.element?.elementColor || '#000000',
        xinghong: userSignInfo.xinghong,
        xinghong_sign: -160,
        heroName: game.heros[userSignInfo.heroId].name,
        username: e.sender.nickname || e.sender.card || '你',
        userIcon: `http://q2.qlogo.cn/headimg_dl?dst_uin=${e.user_id}&spec=5`,
        hisHeros: Object.entries(userSignInfo.history).sort((a, b) => b[1] - a[1]),
        heroNums: Object.keys(userSignInfo.history).length,
        rank: userSignInfo.rank,
        day: Object.values(userSignInfo.history).reduce((a, b) => a + b),
    }
    await saveRender(e, 'sign/index', signData.heroImg, signData, false, { recallMsg: setting.config.signWithdrawal ? 100 : 0 })
}



// 获取用户数据列表
let groupData = {}
const getUserData = (group_id, user_id) => {
    if (!groupData[group_id]) {
        groupData[group_id] = setting.getData('/data/group/' + group_id + '/others') || {}
    }
    let userData = groupData[group_id][user_id] || { history: {} }
    // 防止错误数据
    if (!userData.history) {
        userData.history = {}
    }
    return userData
}
// 保存用户数据
const saveUserData = (group_id, user_id, userSignList) => {
    groupData[group_id][user_id] = userSignList
    setting.setData('/data/group/' + group_id + '/others', groupData[group_id],)
}