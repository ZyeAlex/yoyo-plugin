/** 
 * 入群处理
 */
import plugin from '#plugin'
import setting from '#setting'
import utils from '#utils'

export const Audit = plugin({
  name: '[悠悠助手]入群审核',
  event: 'request.group.add',
  priority: 9999,
  func: [auditAccept]
})

export const AuditConfig = plugin({
  name: '[悠悠助手]入群审核配置',
  event: 'message.group',
  priority: 9999,
  rule: [
    {
      reg: "^#?(查看)?审核词$",
      fnc: wordsGet
    },
    {
      reg: "^#?(?:审核词设置|设置审核词) (.+)$",
      fnc: wordsSet
    },
  ]
})

export const Increase = plugin({
  name: '[悠悠助手]进退群通知',
  event: 'notice.group.increase',
  priority: 9999,
  func: [increaseAccept]
})


const auditInfo = setting.getData('data/user/audit') || {}



async function auditAccept(e) {
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
      redis.set(key, 'yoyo', { EX: 180 }) // 风险账号连续申请入群不予处理
      return await e.approve(false, '疑似风险账号(程序自动判定,如有误判,请在3分钟内重新申请)')
    }
  }

  // 匹配等级
  if (level >= 0 && level < setting.config.refuseLevel) {
    redis.set(key, 'yoyo', { EX: 180 }) // 低等级连续申请入群不予处理
    return await e.approve(false, '等级过低(程序自动判定,如有需求,请在3分钟内重新申请并说明原因)')
  }
  // 不做处理
  if (!(level >= 0) || level < setting.config.authLevel) return true



  // 群组审核 审核不通过不予处理
  if (question) {
    let group_cfg = setting.config.auditInclude?.find(({ group_id }) => group_id == e.group_id)
    if (group_cfg) {
      const reg = new RegExp(group_cfg.answer, 'gi')
      if (!reg.test(answer)) return true
    }
    // 已设置审核且未配置审核词不予处理
    else return true
  }

  // 入群后记录审核信息
  if (!auditInfo[e.group_id]) auditInfo[e.group_id] = {}
  auditInfo[e.group_id][e.user_id] = {
    id: e.user_id,
    name: e.nickname,
    group_id: e.group_id,
    question,
    answer,
    level,
    time: new Date().getTime()
  }
  setting.setData('data/user/audit', auditInfo)

  await e.approve(true)



}
Object.defineProperty(auditAccept, 'name', { value: 'accept' })

async function increaseAccept(e) {
  /** 定义入群欢迎内容 */
  let group_cfg = setting.config.increaseInclude?.find(({ group_id }) => group_id == e.group_id)
  if (!group_cfg) return true
  if (e.user_id === e.bot.uin) return true
  /** cd */
  let key = `[yoyo-plugin]new-comers-${e.group_id}`
  if (await redis.get(key)) return true
  redis.set(key, 'yoyo', { EX: setting.config.increaseCd })
  /** 回复 */
  await e.reply([
    segment.at(e.user_id),
    segment.image(`https://q1.qlogo.cn/g?b=qq&s=0&nk=${e.user_id}`),
    group_cfg.text.replace(/(\\n)|(<br\/?>)/g, '\n')
  ])
}
Object.defineProperty(increaseAccept, 'name', { value: 'accept' })


async function wordsGet(e) {
  // 检测管理员权限
  utils.checkPermission(e)
  let group_cfg = setting.config.auditInclude?.find(({ group_id }) => group_id == e.group_id)
  if (!group_cfg || !group_cfg.answer) {
    return e.reply(`当前群未设置审核词`)
  }
  e.reply(`当前群审核词为「${group_cfg.answer}」`)
}
async function wordsSet(e, reg) {
  const word = e.msg.match(reg)[1]
  if (!word) return true
  // 检测管理员权限
  utils.checkPermission(e)
  let group_cfg = setting.config.auditInclude?.find(({ group_id }) => group_id == e.group_id)
  if (!group_cfg) {
    group_cfg = {
      group_id: e.group_id,
      answer: word.trim()
    }
    setting.config.auditInclude.push(group_cfg)
  } else {
    group_cfg.answer = word.trim()
  }
  setting.setData('config/config', setting.config)
  e.reply(`当前群审核词已设置为「${group_cfg.answer}」`)
}