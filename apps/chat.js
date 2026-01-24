import setting from '#setting'
import plugin from '#plugin'
import Agent from '../agent/agent.js'
import utils from '#utils'


export const Chat = plugin({
    name: '[悠悠助手]悠悠AI',
    event: 'message.group',
    priority: 10000,
    rule: [
        {
            fnc: chat,
            log: false
        }
    ]
})

// 智能体
let agent

// 保存群组内历史聊天内容
const groupUsrMsgs = {}

async function chat(e) {
    //没有配置api-key
    if (!setting.config.apiKey) return true
    // 过滤群聊
    if (!(setting.config.aiInclude || []).includes(e.group_id)) return true

    if (!agent) {
        agent = new Agent()
    }

    // 过滤艾特消息
    if (!groupUsrMsgs[e.group_id]) groupUsrMsgs[e.group_id] = []
    if (e.message.filter(msg => msg.type === 'at').every(({ qq }) => qq != e.self_id)) {
        groupUsrMsgs[e.group_id].push({
            user_id: e.user_id,
            user_name: e.user_name,
            at: false,
            content: e.msg
        })

        // 对话触发概率
        if (Math.random() > setting.config.RandomMsgProbability) {
            return true
        }

    } else {
        groupUsrMsgs[e.group_id].push({
            user_id: e.user_id,
            user_name: e.user_name,
            at: true,
            content: e.msg
        })
    }

    // 截取对话长度
    if (groupUsrMsgs[e.group_id].length > setting.config.msgCacheLength) {
        groupUsrMsgs[e.group_id] = groupUsrMsgs[e.group_id].slice(-setting.config.msgCacheLength)
    }

    // 调用大模型
    const reply = await agent.chat({
        group_name: e.group_name,
        group_id: e.group_id,
        messages: groupUsrMsgs[e.group_id]
    })

    // 发送对话后，用户历史聊天内容将由大模型上下文保存，所以进行清空
    groupUsrMsgs[e.group_id] = []

    reply.map(async reply => {
        await e.reply(handleMsgs(reply))
        await utils.sleep(Math.random() * 1000 + 1000)
    })


}

// 处理对话
function handleMsgs(msg) {
    let reply = []
    msg = msg.reply(/\[at:(\d+)\]/, (_, qq) => {
        reply.push(segment.at(qq))
        return ''
    })
    reply.push(msg)
    return reply
}





