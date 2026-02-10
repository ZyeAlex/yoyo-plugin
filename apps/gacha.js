import render from '#render'
import setting from '#setting'
import plugin from '#plugin'


export const Gacha = plugin({
    name: '[悠悠助手]抽卡',
    event: 'message',
    priority: 9999,
    rule: [
        {
            reg: `^#?(模拟)?(抽卡)$`,
            fnc: simulatedGacha
        }
    ]
})


async function simulatedGacha(e, reg) {
    // e.reply(reg)
    return true
}