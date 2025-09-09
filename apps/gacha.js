import render from '#render'
import setting from '#setting'

export class Help extends plugin {
    constructor() {
        super({
            name: '[悠悠助手]抽卡',
            event: 'message',
            priority: 100,
            rule: [
                {
                    reg: `^${setting.rulePrefix}?(模拟)?(抽卡)$`,
                    fnc: 'simulate'
                },
            ]
        })
    }
    //   模拟抽卡
    async simulate(e) {
        return e.reply('该功能暂未开发')
    }
}