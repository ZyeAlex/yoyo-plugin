import utils from '#utils'
import plugin from '#plugin'
import { issuePanelToken } from '../utils/panel-auth.js'
import { buildPanelLoginUrlLines } from '../utils/panel-url.js'

export const Login = plugin({
  name: '[悠悠助手]面板登录',
  event: 'message',
  priority: 100,
  rule: [
    {
      reg: '^#?悠悠(登录|登陆)$',
      fnc: panelLogin,
    },
  ],
})

async function panelLogin(e) {
  if (!e.isMaster) {
    return e.reply('❎ 该命令仅限主人可用', true)
  }

  let urlLines
  try {
    const token = await issuePanelToken(e.user_id)
    urlLines = await buildPanelLoginUrlLines(token)
  } catch (err) {
    logger.error(`[yoyo-plugin] 生成面板登录令牌失败: ${err.message}`)
    return e.reply('❎ 生成登录地址失败，请确认 Redis 可用后重试', true)
  }

  const message = [
    '欢迎回来主人~',
    'YoAgent 配置面板登录地址（已附带令牌）：',
    ...urlLines,
    '令牌 24 小时内有效，请勿告知他人；过期后请重新发送 #悠悠登录',
  ]

  if (e.isGroup) {
    try {
      await Bot.pickUser(e.user_id).sendMsg(
        await utils.makeForwardMsg(e, message, 'YoAgent 配置登录'),
      )
      return e.reply('登录地址已私信发送给主人~', true)
    } catch (err) {
      logger.error(`[yoyo-plugin] 面板登录私信失败: ${err.message}`)
      return e.reply('❎ 私信发送失败，请加 Bot 好友或在私聊中发送 #悠悠登录', true)
    }
  }

  return e.reply(await utils.makeForwardMsg(e, message, 'YoAgent 配置登录'))
}
