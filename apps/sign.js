import render, { saveRender } from '../utils/render.js'
import utils from '#utils'
import setting from '#setting'
import lodash from 'lodash'
export class Help extends plugin {
    constructor() {
        super({
            name: '[悠悠助手]签到',
            event: 'message',
            priority: 9999,
            rule: [
                {
                    reg: `^${setting.rulePrefix}?(签到|打卡)$`,
                    fnc: 'sign'
                },
                {
                    reg: `^${setting.rulePrefix}?更?换个?(今日)?老婆$`,
                    fnc: 'updateSign'
                }
            ]
        })
    }
    async sign(e) {
        if (!e.group_id) return true
        // 签到过滤
        if (setting.config.signInclude?.length && !setting.config.signInclude.includes(e.group_id) || setting.config.signExclude?.length && setting.config.signExclude.includes(e.group_id)) return true
        // 用户签到数据
        let userSignInfo = setting.getUserData(e.group_id, e.user_id)
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
                userSignInfo.xinghong_sign += Math.floor((memeber - userSignInfo.rank) ^ 1.2)
            }
            // 前1%加成
            memeber = Math.max((await e.group.getMemberList()).length * 0.01, 3)
            if (userSignInfo.rank <= memeber) {
                userSignInfo.xinghong_sign += (memeber - userSignInfo.rank) ^ 2
            }
            // 前3加成
            if (userSignInfo.rank <= 3) {
                userSignInfo.xinghong_sign += (4 - userSignInfo.rank) * 20
            }
            // userSignInfo.xinghong_sign = userSignInfo.rank <= 3 ? ((4 - userSignInfo.rank) * 160 + 160) : 160
            if (!userSignInfo.xinghong) userSignInfo.xinghong = 0
            userSignInfo.xinghong += userSignInfo.xinghong_sign
            // 签到日期
            userSignInfo.date = today
            // 用户信息 排除男主角 排除没有图像的角色
            let heros = Object.keys(setting.heros).filter(id => id != '199002' && setting.heroImgs[id]?.length)
            if (!heros?.length) {
                return e.reply('没有可签到的角色图片，请先上传角色图片！\n或参考readme安装图库')
            }
            userSignInfo.heroId = lodash.sample(heros)
            userSignInfo.history[setting.heros[userSignInfo.heroId].name] = (userSignInfo.history[setting.heros[userSignInfo.heroId].name] || 0) + 1
        }
        // 保存签到数据
        setting.saveUserData(e.group_id, e.user_id, userSignInfo)
        // 发送签到数据
        let signData = {
            hasSign,
            heroImg: lodash.sample(setting.heroImgs[userSignInfo.heroId]),
            color: setting.heros[userSignInfo.heroId]?.element?.elementColor || '#000000',
            xinghong: userSignInfo.xinghong,
            xinghong_sign: userSignInfo.xinghong_sign,
            heroName: setting.heros[userSignInfo.heroId]?.name || userSignInfo.heroName,
            username: e.sender.nickname || e.sender.card || '你',
            userIcon: `http://q2.qlogo.cn/headimg_dl?dst_uin=${e.user_id}&spec=5`,
            hisHeros: Object.entries(userSignInfo.history).sort((a, b) => b[1] - a[1]),
            heroNums: Object.keys(userSignInfo.history).length,
            rank: userSignInfo.rank,
            day: Object.values(userSignInfo.history).reduce((a, b) => a + b),
        }
        await saveRender(e, 'sign/index', signData, signData.heroImg)
    }
    async updateSign(e) {
        if (!e.group_id) return true
        // 签到过滤
        if (setting.config.signInclude?.length && !setting.config.signInclude.includes(e.group_id) || setting.config.signExclude?.length && setting.config.signExclude.includes(e.group_id)) return true
        // 用户签到数据
        let userSignInfo = setting.getUserData(e.group_id, e.user_id)
        // 今日日期
        let today = utils.formatDate(new Date(), 'YYYY-MM-DD')
        if (userSignInfo.date == today) {
            if (userSignInfo.xinghong < 160) {
                e.reply('你的星虹数量不足，无法更换今日老婆~')
                return
            }
            userSignInfo.xinghong_sign = -160
            userSignInfo.xinghong += userSignInfo.xinghong_sign
            // 用户信息 排除男主角 排除没有图像的角色
            let heros = Object.keys(setting.heros).filter(id => id != '199002' && setting.heroImgs[id]?.length)
            if (!heros?.length) {
                return e.reply('没有可签到的角色图片，请先上传角色图片！\n或参考readme安装图库')
            }
            userSignInfo.history[setting.heros[userSignInfo.heroId].name] = (userSignInfo.history[setting.heros[userSignInfo.heroId].name] || 0) - 1
            if (userSignInfo.history[setting.heros[userSignInfo.heroId].name] <= 0) {
                delete userSignInfo.history[setting.heros[userSignInfo.heroId].name]
            }
            userSignInfo.heroId = lodash.sample(heros)
            userSignInfo.history[setting.heros[userSignInfo.heroId].name] = (userSignInfo.history[setting.heros[userSignInfo.heroId].name] || 0) + 1
        }
        // 保存签到数据
        setting.saveUserData(e.group_id, e.user_id, userSignInfo)
        // 发送签到数据
        let signData = {
            updateSign: true,
            heroImg: lodash.sample(setting.heroImgs[userSignInfo.heroId]),
            color: setting.heros[userSignInfo.heroId]?.element?.elementColor || '#000000',
            xinghong: userSignInfo.xinghong,
            xinghong_sign: userSignInfo.xinghong_sign,
            heroName: setting.heros[userSignInfo.heroId].name,
            username: e.sender.nickname || e.sender.card || '你',
            userIcon: `http://q2.qlogo.cn/headimg_dl?dst_uin=${e.user_id}&spec=5`,
            hisHeros: Object.entries(userSignInfo.history).sort((a, b) => b[1] - a[1]),
            heroNums: Object.keys(userSignInfo.history).length,
            rank: userSignInfo.rank,
            day: Object.values(userSignInfo.history).reduce((a, b) => a + b),
        }
        await saveRender(e, 'sign/index', signData, signData.heroImg)
    }
}