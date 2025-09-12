import render from '../utils/render.js'
import utils from '#utils'
import setting from '#setting'
import lodash from 'lodash'
export class Help extends plugin {
    constructor() {
        super({
            name: '[悠悠助手]签到',
            event: 'message',
            priority: 1000,
            rule: [
                {
                    reg: `^${setting.rulePrefix}?(签到|打卡)$`,
                    fnc: 'sign'
                },
            ]
        })
    }


    async sign(e) {
        if (!e.group_id) {
            return e.reply('请在群聊中使用签到功能')
        }
        // 签到过滤
        if (setting.config.signInclude?.length && !setting.config.signInclude.includes(e.group_id) || setting.config.signExclude?.length && setting.config.signExclude.includes(e.group_id)) {
            return true
        }
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
            userSignInfo.xinghong_sign = userSignInfo.rank <= 3 ? ((4 - userSignInfo.rank) * 160 + 160) : 160
            if (!userSignInfo.xinghong) userSignInfo.xinghong = 0
            userSignInfo.xinghong += userSignInfo.xinghong_sign
            // 签到日期
            userSignInfo.date = today
            // 用户信息 排除男主角 排除没有图像的角色
            let heros = Object.keys(setting.heros).filter(id => id != '199002' && setting.heroImgs[id]?.length)
            if (!heros?.length) {
                return e.reply('没有可签到的角色图片，请先上传角色图片！\n或参考readme安装图库')
            }
            const heroId = lodash.sample(heros)
            userSignInfo.heroName = setting.heros[heroId].name
            userSignInfo.history[userSignInfo.heroName] = (userSignInfo.history[userSignInfo.heroName] || 0) + 1
        }

        // 角色图片
        let heroImg = lodash.sample(setting.heroImgs[setting.getHeroId(userSignInfo.heroName)])
        // 保存签到数据
        setting.saveUserData(e.group_id, e.user_id, userSignInfo)
        // 发送签到数据
        let msgRes = await render(e, 'sign/index', {
            hasSign,
            xinghong: userSignInfo.xinghong,
            xinghong_sign: userSignInfo.xinghong_sign,
            heroName: userSignInfo.heroName,
            heroImg,
            username: e.sender.nickname || e.sender.card || '你',
            userIcon: `http://q2.qlogo.cn/headimg_dl?dst_uin=${e.user_id}&spec=5`,
            hisHeros: Object.entries(userSignInfo.history).sort((a, b) => b[1] - a[1]),
            heroNums: Object.keys(userSignInfo.history).length,
            rank: userSignInfo.rank,
            day: Object.values(userSignInfo.history).reduce((a, b) => a + b)
        })

        if (msgRes) {
            // 如果消息发送成功，就将message_id和图片路径存起来，3小时过期
            const message_id = [e.message_id]
            if (Array.isArray(msgRes.message_id)) {
                message_id.push(...msgRes.message_id)
            } else if (msgRes.message_id) {
                message_id.push(msgRes.message_id)
            }
            for (const i of message_id) {
                await redis.set(`yoyo-plugin:original-picture:${i}`, heroImg, { EX: 3600 * 3 })
            }

        }

        return false
    }
}