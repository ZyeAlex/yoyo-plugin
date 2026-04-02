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
        },
        {
            reg: `^#(更新)?面板$`,
            fnc: panel
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
            info = await user.unbindUids(group, qq, uidOrIndex)
        }
        catch (msg) {
            e.reply(msg)
            return
        }
    }

    // 绑定账号
    else {
        try {
            info = await user.bindUids(group, qq, uidOrIndex)
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
            `\nUID: \n  ${info.uids.reduce((s, v, i) => info.active == i ? s + '\n >' + v : s + '\n  ' + v, '')}`,
        ]
    )

}


// 查看账号
async function uid(e, uidOrIndex) {
    let qq = e.user_id
    let info = await user.getUserInfo(qq)
    if (uidOrIndex) {
        info = await user.changeUids(qq, uidOrIndex)
    }
    // 展示账号信息
    e.reply(
        [
            `QQ: ${qq}`,
            `\nUID: \n  ${info.uids.reduce((s, v, i) => info.active == i ? s + '\n >' + v : s + '\n  ' + v, '')}`,
        ]
    )
}


// 查询面板
async function panel(e, isUpdate) {
    let qq = e.user_id
    let info = await user.getUserInfo(qq)
    let uid = info.uids[info.active]
    // 获取游戏信息
    let gameInfo = await user.getGameInfo(uid, isUpdate)
    e.reply(JSON.stringify(gameInfo))
}