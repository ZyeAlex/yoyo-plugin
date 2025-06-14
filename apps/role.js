import data from '#utils.data'
import setting from '#utils.setting'

export class role extends plugin {
    constructor() {
        super({
            name: '[悠悠小助手]角色',
            dsc: '角色帮助',
            event: 'message',
            priority: 100,
            rule: [
                {
                    reg: `^${setting.rulePrefix}(角色列表|全部角色|所有角色)$`,
                    fnc: 'roleList'
                },
            ]
        })
    }

    roleList(e) {
        return e.reply(data.getAllRole().map((role, index) => ` ${index + 1}. ${role}`).join('\n'))
    }
}