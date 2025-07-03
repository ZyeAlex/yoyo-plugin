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
        let userSignList = setting.getUserSignList(e.group_id, e.user_id)
        // 当前时间
        let time = new Date().getTime()
        // 角色名 , 图片 , 中断
        let roleName, roleImg
        // 今日是否签到
        let hasSign = false


        if (userSignList?.length) {
            // 已签到
            let diff = utils.getDateDiffDays(userSignList[0].time, time)
            if (diff == 0) {
                roleName = userSignList[0].roleName
                roleImg = userSignList[0].roleImg
                hasSign = true
                userSignList.shift()
            }
        }

        if (!roleName) {
            roleName = lodash.sample(Object.keys(setting.roles))
        }

        if (!roleImg) {
            roleImg = lodash.sample(setting.getRoleImgs(roleName))
            if (roleImg) {
                roleImg = roleImg.split('/resources')[1]
            } else {
                roleImg = ''
            }
        }



        // 保存签到数据
        if (userSignList[0]) {
            delete userSignList[0].roleImg
            delete userSignList[0].time
        }
        userSignList.unshift({ time, roleName, roleImg })

        setting.saveUserSignData(e.group_id, e.user_id, userSignList)

        // 每日一言
        let daily
        try {
            daily = await hitokoto()
        } catch (error) {
        }
        logger.info(daily)
        // 发送签到数据
        return await render(e, 'sign/index', {
            hasSign, roleName, roleImg, daily,
            hisRoles: userSignList.length > 1 ? this._countAndSortRoles(userSignList) : [],
            username: e.sender.nickname || e.sender.card || '你',
            userIcon: `http://q2.qlogo.cn/headimg_dl?dst_uin=${e.user_id}&spec=5`,
            day: userSignList.length
        })
    }

    // 获取roleName次数
    _countAndSortRoles(list) {
        // 存储统计结果和首次出现索引
        const countMap = new Map();
        const firstOccurrence = new Map();

        // 遍历列表进行统计
        list.forEach((item, index) => {
            const roleName = item.roleName;

            // 更新计数
            if (countMap.has(roleName)) {
                countMap.set(roleName, countMap.get(roleName) + 1);
            } else {
                countMap.set(roleName, 1);
                // 记录首次出现位置
                firstOccurrence.set(roleName, index);
            }
        });

        // 转换为数组格式
        const resultArray = Array.from(countMap, ([roleName, count]) => ({
            roleName,
            count,
            firstIndex: firstOccurrence.get(roleName)
        }));

        // 排序：先按次数降序，次数相同按首次出现顺序
        resultArray.sort((a, b) => {
            if (b.count !== a.count) {
                return b.count - a.count; // 次数降序
            }
            return a.firstIndex - b.firstIndex; // 相同次数按首次出现顺序
        });

        // 转换为最终输出格式
        return resultArray.map(item => [item.roleName, item.count]);
    }
}