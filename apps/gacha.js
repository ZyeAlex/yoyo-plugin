import render from '#render'
import setting from '#setting'
import plugin from '#plugin'


export const Gacha = plugin({
    name: '[悠悠助手]抽卡',
    event: 'message',
    priority: 100,
    rule: [
        {
            reg: `^${setting.rulePrefix}?(模拟)?(抽卡)$`,
            fnc(e, reg) {
                e.reply(reg)
                e.reply('该功能暂未开发')
            }
        }
    ]
})