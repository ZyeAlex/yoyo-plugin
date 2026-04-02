import plugin from '#plugin'


export const Gacha = plugin({
    name: '[悠悠助手]登录',
    event: 'message',
    priority: 100,
    rule: [
        {
            reg: `^#登录$`,
            fnc: login
        },
        {
            reg: `^#扫码登录$`,
            fnc: scanLogin
        },
    ]
})


async function login(e) {
}
async function scanLogin(e) {
}