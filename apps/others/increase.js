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
  priority: -1,
  rule: [
    {
      reg: "^#(查看)?审核词列?表?$",
      fnc: wordsGet
    },
    {
      reg: "^#((?:设置|添加|新增|删除)审核词)[ +]?(.+)$",
      fnc: wordsSet
    },
    {
      reg: "^#[全qQ]?局?(?:(?:[踢黑撤回thcTHC]+ ?([0-9,， ]*))|(?:[解除禁言撤回jcJC]+([0-9半一二三四五六七八九十个秒分钟小时天]*) ?([0-9,， ]*)))$",
      fnc: manage
    },
    // {
    //   reg: "^[解除禁言撤回jcJC]+([0-9半一二三四五六七八九十个秒分钟小时天]*) ([0-9,， ]*)$",
    //   fnc: manage
    // }
  ]
})

/** 入群审核
 */
async function auditAccept(e) {
  if (e.bot.adapter?.name !== "OneBotv11" || typeof e.bot.sendApi !== "function" || e.user_id === e.self_id) return true


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

  // 邀请加群不予处理
  if (e.invitor_id) return true

  // 匹配人机 
  for (let text of setting.config.excludeText) {
    if (!text) continue
    const reg = new RegExp(text, 'gi')
    if (reg.test(answer)) {
      redis.set(key, 'yoyo', { EX: 600 }) // 风险账号连续申请入群不予处理
      return await e.approve(false, '风险账号(程序判定,可在10分钟内重新申请)')
    }
  }



  // 匹配等级
  if (level >= 0 && level < setting.config.refuseLevel) {
    redis.set(key, 'yoyo', { EX: 600 }) // 低等级连续申请入群不予处理
    return await e.approve(false, '等级过低(程序判定,可在10分钟内重新申请)')
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


  if (e.operator_id == e.user_id) {
    if (/\\i/.test(group_cfg.exit)) reply.push(segment.image(`https://q1.qlogo.cn/g?b=qq&s=160&nk=${e.user_id}`))
    reply.push(group_cfg.exit.replace(/\\i/g, '').replace(/\\u/g, `${nickname}(${e.user_id})`))
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
  e.reply(
    [
      `当前群审核词为「${group_cfg.answer}」`,
      `\n发送「${setting.config.rulePrefix[0]}添加审核词+审核词」可以新增审核词`,
      group_cfg.answer ? `\n发送「${setting.config.rulePrefix[0]}设置审核词+审核词」可以重新设置审核词` : '',
    ]
  )
}
async function wordsSet(e, sep, word) {
  // 检测管理员权限
  utils.checkPermission(e)
  if (!word) return true
  word = word.trim().split(/[,， ]/g).join('|')
  // 检测管理员权限
  utils.checkPermission(e)
  let group_cfg = setting.config.auditInclude?.find(({ group_id }) => group_id == e.group_id)

  // 删除
  if (sep.includes('删除')) {
    if (!group_cfg || !group_cfg.answer) {
      e.reply(`当前群未设置审核词`)
      return
    }
    group_cfg.answer = group_cfg.answer.split('|').filter(w => !word.includes(w)).join('|')
    e.reply([
      `已删除审核词「${word}」`,
      group_cfg.answer ? `\n当前群审核词「${group_cfg.answer}」` : '\n当前群审核词已清空'
    ])
    return
  }

  if (!group_cfg) {
    group_cfg = {
      group_id: e.group_id,
      answer: word
    }
    setting.config.auditInclude.push(group_cfg)
  } else {
    if (sep.includes('添加')) {
      group_cfg.answer = group_cfg.answer + '|' + word
    } else {
      group_cfg.answer = word
    }
  }
  setting.setData('config/config', setting.config)
  e.reply(`当前群审核词已设置为「${group_cfg.answer}」`)
}


// 群管理
async function manage(e, m1, m2 = 60, m3) {
  utils.checkPermission(e)
  // 检测管理员权限
  if (e.bot.adapter?.name !== "OneBotv11" || typeof e.bot.sendApi !== "function") return true

  // 获取被权限的成员
  let qqs = e.message.filter(item => item.type === 'at').map(({ qq }) => qq)
  let qstr = m1
  if (qstr) qqs = qqs.concat(qstr.trim().split(/[ ,，]/g))
  qstr = m3
  if (qstr) qqs = qqs.concat(qstr.trim().split(/[ ,，]/g))

  // 获取qq群
  let groups = [e.group_id]
  if (e.msg.includes('全') || e.msg.includes('q') || e.msg.includes('Q')) groups = await e.bot.getGroupList()

  // 获取禁言时间
  let time = utils.durationToSeconds(m2)

  // 是否拉黑
  let request = e.msg.includes('黑') || e.msg.includes('h') || e.msg.includes('H')

  if (e.msg.includes('踢') || e.msg.includes('t') || e.msg.includes('T')) {
    await kick(e, groups, qqs, request)
  }
  if (e.msg.includes('禁') || e.msg.includes('j') || e.msg.includes('J')) {
    await ban(e, [e.group_id], qqs, time) // 不支持全局禁言
  }
  if (e.msg.includes('撤') || e.msg.includes('c') || e.msg.includes('C')) {
    await del(e, groups, qqs)
  }

}

// 踢出成员
async function kick(e, groups, qqs, reject_add_request) {
  if (!qqs.length) return
  // 遍历踢出
  for (let user_id of qqs) {
    for (let group_id of groups) {
      try {
        await e.bot.sendApi("set_group_kick", {
          group_id,
          user_id,
          reject_add_request
        })
        redis.set(`[yoyo-plugin]kick-${group_id}-${user_id}`, 'yoyo', { EX: 10 })
      } catch (error) { }
    }
  }
}
// 禁
async function ban(e, groups, qqs, time) {
  if (!qqs.length || !time) return
  let release = e.msg.includes('解')

  for (let user_id of qqs) {
    for (let group_id of groups) {
      try {
        await e.bot.sendApi("set_group_ban", {
          group_id,  // 群ID（必填）
          user_id,   // 被禁言用户ID（必填）
          duration: release ? 0 : time, // 禁言时长（秒）
          comment: "违规发言"
        });
      } catch (err) {
      }
    }
  }
}

// 撤  
async function del(e, groups, qqs) {
  // 回复的消息
  let reply = e.message.find(item => item.type == 'reply')
  if (reply) {
    await e.bot.sendApi("delete_msg", { message_id: reply.id, self_id: e.self_id })
    return
  } else if (!qqs.length) return
  // 撤回消息
  for (let group_id of groups) {
    const { data: { messages } } = await e.bot.sendApi("get_group_msg_history", { group_id, message_seq: 0, count: 200 })
    const targetMsgs = messages.reverse().filter(msg => qqs.find(qq => qq == msg.user_id))
    for (const { message_id } of targetMsgs) {
      try {
        await e.bot.sendApi("delete_msg", { message_id, self_id: e.self_id })
        await utils.sleep(200)
      } catch (err) {
      }
    }
  }

}

