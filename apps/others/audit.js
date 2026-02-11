import plugin from '#plugin'
import setting from '#setting'


export const Audit = plugin({
    name: '[悠悠助手]入群审核',
    event: 'request.group.add',
    priority: 9999,
    func: [accept]
})

async function accept(e) {
    if (e.bot.adapter?.id !== "QQ" || typeof e.bot.sendApi !== "function" || e.user_id === e.bot.uin) return true
    const { data: { level } } = await e.bot.sendApi("get_stranger_info", { user_id: e.user_id });
    // level 64
    // e.comment '问题：游戏名字叫什么\n答案：蓝色星原旅谣啊'
    // e.group_id 991709221 
    // e.user_id 76239010
    // e.time: 1770817152,


    // await e.approve(true)
    // await e.approve(false, '不符合入群条件，自动拒绝')

    return true
}