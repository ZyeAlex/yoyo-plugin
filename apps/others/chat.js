import setting from '#setting'
import plugin from '#plugin'
import Agent from '../agent/agent.js'
import utils from '#utils'


export const Chat = plugin({
    name: '[悠悠助手]悠悠AI',
    event: 'message.group',
    priority: 10000,
    func: [accept]
})


// 智能体
let agent

// 保存群组内历史聊天内容
const groupUsrMsgs = {}

async function accept(e) {
    //没有配置api-key
    if (!setting.config.apiKey) return true
    // 过滤群聊
    if (!(setting.config.aiInclude || []).includes(e.group_id)) return true

    if (!agent) {
        agent = new Agent()
    }


    if (!groupUsrMsgs[e.group_id]) groupUsrMsgs[e.group_id] = []

    let isAt = false

    // 用户会话
    let usermsg = {
        user_id: e.user_id,
        user_name: e.user_name,
        message_id: e.message_id,
        message: await Promise.all(e.message.map(async item => {
            if (item.type == 'at' && item.qq == e.self_id) isAt = true
            if (item.type == 'reply') {
                const result = await e.bot.adapter.getMsg({ bot: e.bot }, item.id)
                item.user_id = result.user_id
                item.message = result.message
            }
            return item
        }))
    }



    groupUsrMsgs[e.group_id].push(usermsg)

    // 截取对话长度
    if (groupUsrMsgs[e.group_id].length > setting.config.msgCacheLength) {
        groupUsrMsgs[e.group_id] = groupUsrMsgs[e.group_id].slice(-setting.config.msgCacheLength)
    }

    if (!isAt) return

    // 调用大模型
    const messages = await agent.chat({
        group_name: e.group_name,
        group_id: e.group_id,
        self_id: e.self_id,
        messages: groupUsrMsgs[e.group_id]
    }, e)



    // 发送对话后，用户历史聊天内容将由大模型上下文保存，所以进行清空
    groupUsrMsgs[e.group_id] = []


    for (let message of messages) {
        if (!message) break
        message = message.map(item => {
            if (item.type == "image") {
                return segment.image(item.url)
            }
            return item
        })

        await e.reply(message)

        await utils.sleep(Math.random() * 1000 + 1000)

    }

}





