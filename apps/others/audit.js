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
    let question, answer
    if (e.comment.includes('答案')) {
        [question, answer] = e.comment.replace(/\n|问题：/g, '').split('答案：')
    }
    else {
        answer = e.comment
    }

    // 连续申请不予处理
    let key = `[yoyo-plugin]new-request-${e.group_id}-${e.user_id}`
    if (await redis.get(key)) return true


    // 匹配人机 
    for (let text of setting.config.excludeText) {
        if (!text) continue
        const reg = new RegExp(text, 'gi')
        if (reg.test(answer)) {
            return await e.approve(false, '疑似风险账号')
        }
    }

    // 匹配等级
    if (level >= 0 && level < setting.config.refuseLevel) {
        redis.set(key, 'yoyo', { EX: 120 }) // 低等级连续申请入群不予处理
        return await e.approve(false, '等级过低')
    }
    // 不做处理
    if (!(level >= 0) || level < setting.config.authLevel) {
        return true
    }


    // 群组审核 审核不通过不予处理
    let group_cfg = setting.config.auditInclude?.find(({ group_id }) => group_id == e.group_id)
    if (group_cfg) {
        const reg = new RegExp(group_cfg.answer, 'gi')
        if (!reg.test(answer)) {
            return true
        }
    }


    await e.approve(true)

}