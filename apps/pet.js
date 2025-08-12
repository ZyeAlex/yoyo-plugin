import setting from '#setting'
import render from '#render'
import lodash from 'lodash'
export class Pet extends plugin {
    constructor() {
        super({
            name: '[悠悠小助手]奇波',
            dsc: '悠悠奇波',
            event: 'message',
            priority: 102,
            rule: [
                {
                    reg: `^${setting.rulePrefix}?(奇波列表|全部奇波|所有奇波)$`,
                    fnc: 'petList'
                },
                {
                    reg: `^${setting.rulePrefix}?.{1,10}(图鉴|卡片|card|Card)$`,
                    fnc: 'petCard'
                },
            ]
        })
    }
    // 奇波列表
    async petList(e) {
        return await render(e, 'pet/list', {
            pets: Object.entries(Object.values(setting.pets).reduce((acc, cur) => {
                if (!cur.item1) {
                    cur.item1 = '未知'
                }
                if (!acc[cur.item1]) {
                    acc[cur.item1] = []
                }
                acc[cur.item1].push(cur)

                let unkown = cur['未知']
                delete cur['未知']
                cur['未知'] = unkown

                return acc
            }, {})),
            length: Object.values(setting.pets).length,
            img:lodash.sample(Object.values(setting.pets)).img
        })
    }
    // 奇波卡片
    async petCard(e) {
        // 角色名
        let name = e.msg.match(new RegExp(`^${setting.rulePrefix}?(.{1,10})(图鉴|卡片|card|Card)$`))[1]

        if (!setting.pets[name]) return true

        return await render(e, 'pet/card', {

        })
    }
}