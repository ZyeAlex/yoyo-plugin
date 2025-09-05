import render from '#render'
import setting from '#setting'

export class Help extends plugin {
    constructor() {
        super({
            name: '[悠悠助手]装备',
            event: 'message',
            priority: 100,
            rule: [
                {
                    reg: `^${setting.rulePrefix}?(装备列表|装备图鉴|全部装备)$`,
                    fnc: 'accessoryList'
                },
            ]
        })
    }
    //   装备列表
    async accessoryList(e) {
        return await render(e, 'accessory/list', {
            accessories:setting.accessories
        })
    }
}