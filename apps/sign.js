import render from '../utils/render.js'
import utils from '#utils'
import setting from '#setting'
import lodash from 'lodash'
import { hitokoto } from '../api/other.js'
export class Help extends plugin {
    constructor() {
        super({
            name: '[悠悠小助手]签到',
            dsc: '悠悠签到',
            event: 'message',
            priority: 100,
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
        let userSignInfo = setting.getUserSignInfo(e.group_id, e.user_id)
        // 今日是否签到
        let hasSign = false
        // 今日日期
        let today = utils.formatDate(new Date(), 'YYYY-MM-DD')
        if (userSignInfo.date == today) {
            // 过滤脏数据
            if (!Object.keys(setting.roles).includes(userSignInfo.roleName)) {
                delete userSignInfo.history[userSignInfo.roleName]
                // 用户信息
                userSignInfo.roleName = lodash.sample(Object.keys(setting.roles))
                userSignInfo.roleImg = lodash.sample(setting.getRoleImgs(userSignInfo.roleName))
                if (userSignInfo.roleImg) {
                    userSignInfo.roleImg = userSignInfo.roleImg.split('/resources')[1]
                } else {
                    userSignInfo.roleImg = ''
                }
                userSignInfo.history[userSignInfo.roleName] = (userSignInfo.history[userSignInfo.roleName] || 0) + 1
            }
            hasSign = true
        } else {
            // 签到排名
            let signRanks = await redis.get('yoyo:sign:rank')
            signRanks = signRanks ? JSON.parse(signRanks) : {}
            let signRank = signRanks[e.group_id] = signRanks[e.group_id] || [today, 0]
            signRank = signRank[0] == today ? signRank : [today, 0]
            userSignInfo.rank = ++signRank[1]
            redis.set('yoyo:sign:rank', JSON.stringify(signRanks))
            // 签到日期
            userSignInfo.date = today
            // 用户信息
            userSignInfo.roleName = lodash.sample(Object.keys(setting.roles))
            userSignInfo.roleImg = lodash.sample(setting.getRoleImgs(userSignInfo.roleName))
            if (userSignInfo.roleImg) {
                userSignInfo.roleImg = userSignInfo.roleImg.split('/resources')[1]
            } else {
                userSignInfo.roleImg = ''
            }
            userSignInfo.history[userSignInfo.roleName] = (userSignInfo.history[userSignInfo.roleName] || 0) + 1
        }
        // 保存签到数据
        setting.saveUserSignData(e.group_id, e.user_id, userSignInfo)
        // 每日一言
        let daily
        try {
            daily = await hitokoto()
        } catch (error) {
        }
        // 发送签到数据
        return await render(e, 'sign/index', {
            hasSign, daily,
            roleName: userSignInfo.roleName,
            roleImg: userSignInfo.roleImg,
            username: e.sender.nickname || e.sender.card || '你',
            userIcon: `http://q2.qlogo.cn/headimg_dl?dst_uin=${e.user_id}&spec=5`,
            hisRoles: Object.entries(userSignInfo.history).sort((a, b) => b[1] - a[1]),
            roleNums: Object.keys(userSignInfo.history).length,
            rank: userSignInfo.rank,
            day: Object.values(userSignInfo.history).reduce((a, b) => a + b)
        })

    }
}