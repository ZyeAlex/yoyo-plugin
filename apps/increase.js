import plugin from '#plugin'
import setting from '#setting'

export const increase = plugin({
  name: '[悠悠助手]进退群通知',
  event: 'notice.group.increase',
  priority: 9999,
  func: [accept]
})


async function accept(e) {
  /** 定义入群欢迎内容 */
  if (e.user_id === e.bot.uin) return
  if (!setting.config.increaseInclude?.[e.group_id]) return
  /** cd */
  let key = `[yoyo-plugin]new-comers-${e.group_id}`
  if (await redis.get(key)) return
  redis.set(key, '1', { EX: setting.config.increaseCd })

  let nickname
  if (e.nickname) {
    nickname = e.nickname
  } else if (e.sender && e.sender.card) {
    nickname = e.sender.card
  } else {
    // 从成员列表里获取该用户昵称
    let memberMap = await e.group.getMemberMap()
    nickname = (memberMap && memberMap.get(e.user_id)) ? memberMap.get(e.user_id).nickname : ''
  }


  /** 回复 */
  await e.reply([
    segment.at(e.user_id),
    segment.image(`https://q1.qlogo.cn/g?b=qq&s=0&nk=${e.user_id}`),
    setting.config.increaseInclude[e.group_id].replace(/(\\n)|(<br\/?>)/g, '\n')
  ])
}

