import render from '../utils/render.js'
import utils from '#utils'
import setting from '#setting'
import lodash from 'lodash'
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
                {
                    reg: `^${setting.rulePrefix}?清除错误签到数据$`,
                    fnc: ''
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



        // 兼容老项目的userSignList
        if (Array.isArray(userSignInfo)) {
            userSignInfo = {
                date: utils.formatDate(userSignInfo[0]?.time, 'YYYY-MM-DD'),
                roleName: userSignInfo[0]?.roleName,
                roleImg: userSignInfo[0]?.roleImg,
                history: userSignInfo.reduce((acc, { roleName }) => {
                    acc[roleName] = (acc[roleName] || 0) + 1;
                    return acc;
                }, {})
            }
        }

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
        setting.saveUserData(e.group_id, e.user_id, userSignInfo)
        // 发送签到数据
        return await render(e, 'sign/index', {
            hasSign,
            xinghong: userSignInfo.xinghong,
            xinghong_sign: userSignInfo.xinghong_sign,
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