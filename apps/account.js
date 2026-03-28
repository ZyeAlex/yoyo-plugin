import plugin from '#plugin'
import user from '#user'

export const Account = plugin({
    name: '[悠悠助手]账号',
    event: 'message',
    priority: 100,
    rule: [
        {
            reg: `^#((?:删除?)|(?:解?绑定?))账?号?[Uu]?[Ii]?[Dd]?[Ss]?[ +]?([0-9]{1,10})$`,
            fnc: bind
        },
        {
            reg: `^#切?换?查?看?[Uu][Ii][Dd][Ss]?([0-9]{0,10})$`,
            fnc: uid
        }
    ]
})
// 绑定账号
async function bind(e, op, uidOrIndex) {

    let qq = e.user_id
    let group = e.group_id
    let info
    // 解绑账号
    if (op.includes('解') || op.includes('删')) {
        try {
            info = await user.unbindAccount(group, qq, uidOrIndex)
        }
        catch (msg) {
            e.reply(msg)
            return
        }
    }

    // 绑定账号
    else {
        try {
            info = await user.bindAccount(group, qq, uidOrIndex)
        }
        catch (msg) {
            e.reply(msg)
            return
        }
    }


    // 展示账号信息
    e.reply(
        [
            `QQ: ${qq}`,
            `\nUID: \n  ${info.uids.join('\n  ')}`,
        ]
    )

}


// 查看账号
async function uid(e, uidOrIndex) {
    let qq = e.user_id
    let info = user.getUserInfo(qq)
    if (uidOrIndex) {
        info = await user.changeAccount(qq, uidOrIndex)
    }

    // 展示账号信息
    e.reply(
        [
            `QQ: ${qq}`,
            `\nUID: \n  ${info.uids.reduce((s, v, i) => info.active == i ? s + '\n >' + v : s + '\n  ' + v, '')}`,
        ]
    )
}
