import render from '#render'
import setting from '#setting'
import plugin from '#plugin'


export const Gacha = plugin({
    name: '[悠悠助手]登录',
    event: 'message',
    priority: 100,
    rule: [
        {
            reg: `^${setting.rulePrefix}登录$`,
            fnc: login
        },
        {
            reg: `^${setting.rulePrefix}扫码登录$`,
            fnc: scanLogin
        },
    ]
})


async function login(e, reg) {
    e.reply(reg)
    e.reply('该功能暂未开发')
}
async function scanLogin(e, reg) {
    e.reply(reg)
    e.reply('该功能暂未开发')
}