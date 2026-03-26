import plugin from '#plugin'
import user from '#user'

export const Help = plugin({
    name: '[悠悠助手]账号',
    event: 'message',
    priority: 100,
    rule: [
        {
            reg: `^#(删?解?除?绑定?)账?号?U?u?I?i?D?d?[ +]?([0-9]{9,10})$`,
            fnc: bind
        }
    ]
})
// 绑定账号
async function bind(e, op, uidOrIndex) {

    let qq = e.user_id
    let group = e.group_id
    let info = user.getUserInfo(qq)

    // 解绑账号
    if (op.includes('解') || op.includes('删')) {
        try {
            info = await user.unbindAccount(e, uidOrIndex, qq, group)
        }
        catch (msg) {
            e.reply(msg)
            return
        }
    }

    // 绑定账号
    else {
        try {
            info = await user.bindAccount(e, uidOrIndex, qq, group)
        }
        catch (msg) {
            e.reply(msg)
            return
        }
    }


    // 展示账号信息
    e.reply(
        `QQ: ${qq}`,
        `\nUID: \n  ${info.uids.join('\n  ')}`,
    )

}

