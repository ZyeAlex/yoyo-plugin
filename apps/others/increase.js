/** 
 * 入群处理
 */
import plugin from '#plugin'
import setting from '#setting'
import utils from '#utils'

export const Audit = plugin({
  name: '[悠悠助手]入群审核',
  event: 'request.group.add',
  priority: 100,
  func: [auditAccept]
})
export const Increase = plugin({
  name: '[悠悠助手]进群通知',
  event: 'notice.group.increase',
  priority: 100,
  func: [increaseAccept]
})
export const Decrease = plugin({
  name: '[悠悠助手]退群通知',
  event: 'notice.group.decrease',
  priority: 100,
  func: [decreaseAccept]
})



export const AuditConfig = plugin({
  name: '[悠悠助手]群管理',
  event: 'message.group',
  priority: 100,
  rule: [
    {
      reg: "^#(查看)?审核词$",
      fnc: wordsGet
    },
    {
      reg: "^#(?:审核词设置|设置审核词) ?(.+)$",
      fnc: wordsSet
    },
    {
      reg: "^#(?:全?局?踢黑? ?([0-9 ,，]*)|解?除?禁言?([\\u4e00-\\u9fa5a-zA-Z0-9]{0,10})|撤回?)+$",
      fnc: manage
    }
  ]
})

/** 入群审核
 */
async function auditAccept(e) {
  if (e.bot.adapter?.name !== "OneBotv11" || typeof e.bot.sendApi !== "function" || e.user_id === e.self_id) return true

  // 匹配黑名单成员 直接拒绝
  let blacklist = setting.getData('data/group/blacklist') || []
  if (blacklist.find(qq => qq == e.user_id)) {
    await e.approve(false, '风险账号,禁止加群(程序自动判定)')
    return
  }


  const { data: { level } } = await e.bot.sendApi("get_stranger_info", { user_id: e.user_id });
  let question, answer
  if (e.comment.includes('答案')) {
    [question, answer] = e.comment.replace(/\n|问题：/g, '').split('答案：')
  }
  else {
    answer = e.comment
  }

  // 连续申请不予处理
  let key = `[yoyo-plugin]audit-${e.group_id}-${e.user_id}`
  if (await redis.get(key)) return true


  // 匹配人机 
  for (let text of setting.config.excludeText) {
    if (!text) continue
    const reg = new RegExp(text, 'gi')
    if (reg.test(answer)) {
      redis.set(key, 'yoyo', { EX: 300 }) // 风险账号连续申请入群不予处理
      return await e.approve(false, '风险账号(程序判定,可在5分钟内重新申请)')
    }
  }

  // 匹配等级
  if (level >= 0 && level < setting.config.refuseLevel) {
    redis.set(key, 'yoyo', { EX: 300 }) // 低等级连续申请入群不予处理
    return await e.approve(false, '等级过低(程序判定,可在5分钟内重新申请并说明)')
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

  await e.approve(true)
}
Object.defineProperty(auditAccept, 'name', { value: 'accept' })

/** 入群通知
 */
async function increaseAccept(e) {
  /** 定义入群欢迎内容 */
  let group_cfg = setting.config.increaseInclude?.find(({ group_id }) => group_id == e.group_id)
  if (!group_cfg) return true
  if (e.user_id === e.self_id) return true
  /** cd */
  let key = `[yoyo-plugin]new-comers-${e.group_id}`
  if (await redis.get(key)) return true
  redis.set(key, 'yoyo', { EX: setting.config.increaseCd })
  /** 回复 */
  await e.reply([
    segment.at(e.user_id),
    segment.image(`https://q1.qlogo.cn/g?b=qq&s=160&nk=${e.user_id}`),
    group_cfg.text.replace(/(\\n)|(<br\/?>)/g, '\n')
  ])
}
Object.defineProperty(increaseAccept, 'name', { value: 'accept' })


/** 退群通知
 */
async function decreaseAccept(e) {

  const pick = await e.group?.pickMember?.(e.user_id)
  const info = await pick?.getInfo?.() || pick?.info || pick
  const nickname = info?.card || info?.nickname

  let group_cfg = setting.config.increaseInclude?.find(({ group_id }) => group_id == e.group_id)
  if (!group_cfg?.exit) return true
  let reply = []
  if (/\\i/.test(group_cfg.exit)) {
    group_cfg.exit = group_cfg.exit.replace(/\\i/g, '')
    reply.push(segment.image(`https://q1.qlogo.cn/g?b=qq&s=160&nk=${e.user_id}`))
  }

  if (e.operator_id == e.user_id) {
    reply.push(group_cfg.exit.replace(/\\u/g, `${nickname}(${e.user_id})`))
  } else {
    if (await redis.set('[yoyo-plugin]kick-' + e.group_id + '-' + e.user_id)) return true  // 被机器人踢出的群员，不报通知
    reply.push(`${nickname}(${e.user_id})被管理员移出群聊`)
  }
  let key = `[yoyo-plugin]decrease-${e.group_id}`
  if (await redis.get(key)) return true
  redis.set(key, '1', { EX: 1000 })

  await e.reply(reply)
}
Object.defineProperty(decreaseAccept, 'name', { value: 'accept' })


/** 群审核配置
 */
// 审核词
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
  // 检测管理员权限
  utils.checkPermission(e)
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


// 群管理
async function manage(e, reg) {
  // 检测管理员权限
  if (!utils.checkPermission(e, false)) return true
  if (e.bot.adapter?.name !== "OneBotv11" || typeof e.bot.sendApi !== "function") return true
  if (e.msg.includes('踢')) {
    let kickAll = e.msg.includes('全')
    let kicks = await kick(e, reg, kickAll)
    if (!kicks.length) return true
    await del(e, kicks)
    return
  }
  if (e.msg.includes('撤')) {
    await del(e)
  }
  if (e.msg.includes('禁')) {
    await ban(e, reg)
  }
}

// 踢出成员（支持局部和全局）
async function kick(e, reg, kickAll) {
  // 获取 @ 的成员
  let qqs = e.message.filter(item => item.type === 'at').map(({ qq }) => qq)

  let qqstr = e.msg.match(reg)[1]
  qqs = qqs.concat(qqstr.trim().split(/[ ,，]/g))


  if (!qqs.length) {
    e.reply('❌ 请@要踢出的成员')
    throw new Error()
  }

  // 记录黑名单
  if (e.msg.includes('全') && e.msg.includes('黑')) {
    let blacklist = setting.getData('data/group/blacklist') || []
    blacklist = [...new Set(blacklist.concat(qqs).filter(qq => qq))]
    setting.setData('data/group/blacklist', blacklist)
  }

  let kicks = []
  for (let qq of qqs) {
    let group_ids = [e.group_id]
    if (kickAll) group_ids = group_ids.concat(await e.bot.getGroupList())

    for (let group_id of group_ids) {
      try {
        await e.bot.sendApi("set_group_kick", {
          group_id,
          user_id: qq,
          reject_add_request: e.msg.includes('黑')
        })
        redis.set(`[yoyo-plugin]kick-${group_id}-${qq}`, 'yoyo', { EX: 10 })
      } catch (error) { }
    }
    kicks.push(qq)
  }
  return kicks
}

// 撤
async function del(e, qqs = []) {
  // 回复的消息
  let reply = e.message.find(item => item.type == 'reply')
  if (reply) {
    await e.bot.sendApi("delete_msg", { message_id: reply.id, self_id: e.self_id })
    return
  }
  // @的成员
  qqs = qqs.concat(e.message.filter(item => item.type == 'at').map(({ qq }) => qq))
  if (!qqs.length) {
    e.reply('❌ 请@要撤回消息的成员')
    throw new Error()
  }
  const { data: { messages } } = await e.bot.sendApi("get_group_msg_history", { group_id: e.group_id, message_seq: 0, count: 200 })
  const targetMsgs = messages.reverse().filter(msg => qqs.find(qq => qq == msg.user_id))
  for (const { message_id } of targetMsgs) {
    try {
      await e.bot.sendApi("delete_msg", { message_id, self_id: e.self_id })
      await utils.sleep(200)
    } catch (err) {
    }
  }
}
// 禁
async function ban(e, reg) {
  const time = utils.durationToSeconds(e.msg.match(reg)[2] || 60 * 60)
  if (!time) return true // 时间超出范围
  let release = e.msg.includes('解')
  // @的成员
  let ats = e.message.filter(item => item.type == 'at')
  if (!ats.length) {
    e.reply(release ? '❌ 请@要解禁的成员' : '❌ 请@要禁言的成员')
    throw new Error()
  }
  for (let at of ats) {
    await e.bot.sendApi("set_group_ban", {
      group_id: e.group_id,  // 群ID（必填）
      user_id: at.qq,        // 被禁言用户ID（必填）
      duration: release ? 0 : time,     // 禁言时长（秒）
      comment: "违规发言"
    });
  }
}

