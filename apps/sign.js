import runtimeRender from '../utils/runtime-render.js'
import utils from '#utils'
import setting from '#setting'
import lodash from 'lodash'

export class Help extends plugin {
    constructor() {
        super({
            name: '[悠悠小助手]签到',
            dsc: '悠悠签到',
            event: 'message',
            priority: 10000,
            rule: [
                {
                    reg: `^${setting.rulePrefix}?签到$`,
                    fnc: 'sign'
                }
            ]
        })
    }

    async sign(e) {
        if (!e.group_id) {
            return e.reply('请在群聊中使用签到功能')
        }
        // 用户签到数据
        let userSignList = setting.getUserSignList(e.group_id, e.user_id)
        let time = new Date().getTime()
        // {
        //     time: new Date().getTime(),
        //     roleName:'',
        //     roleImg:''
        // }
        if (userSignList?.length) {
            let diff = utils.getDateDiffDays(userSignList[0].time, time)
            if (diff == 0) {
                e.reply(['今天已经签到过了哦，\n请明天再来吧~'])
                return
            } else if (diff != 1) {
                userSignList = []
            }
        }
        const roleName = lodash.sample(setting.getAllRole())
        const img_urls = setting.getRoleImgs(roleName)
        let roleImg = lodash.sample(img_urls)
        if (roleImg) {
            roleImg = roleImg.split('/resources')[1]
        }
        else {
            roleImg = ''
        }
        // 保存签到数据
        userSignList.unshift({ time, roleName })
        setting.saveUserSignData(e.group_id, e.user_id, userSignList)
        // 发送签到数据
        return await runtimeRender(e, 'sign/index', {
            roleName,
            roleImg,
            username: e.sender.nickname || e.sender.card || '你',
            day: userSignList.length
        })
    }
}