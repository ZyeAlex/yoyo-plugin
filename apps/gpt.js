import setting from '#setting'
import OpenAI from "openai"


let client,
    messageGroups = [],
    tools = []
export class Help extends plugin {
    constructor() {
        super({
            name: '[悠悠助手]悠悠AI',
            event: 'message.group',
            priority: 9999,
            rule: [
                {
                    fnc: 'chat',
                    log: false
                }
            ]
        })
    }
    async chat(e) {
        if (!this.initChat(e)) return true // 初始化

        let messages = messageGroups[e.group_id]
        if (!messages) messages = messageGroups[e.group_id] = {
            system: [
                {
                    role: "system",
                    content: `
                    你在一个QQ群里参与对话，群名为：${e.group_name}，群号为${e.group_id}，
                    你需要记住每位用户的用户名和userid。
                    如果你认为你正在对userid说话，可以带上 [CQ:reply,qq=userid]。
                    你可以一次at多位用户，但每位用户至多只能at一次。
                    ` }
            ],
            chat: []
        }


        let message = { role: "user", content: `用户名:${e.sender.nickname}，userid:${e.user_id} 说：${e.msg}` }

        let response = await client.chat.completions.create({
            model: 'deepseek-chat',
            frequency_penalty: 0.2,
            presence_penalty: 0.2,
            messages: [
                ...messages.system,
                ...messages.chat,
                message
            ],
            //tools: tools,
            //tool_choice: "auto" 
        })
        // 内容
        let originalRetMsg = response.choices[0].message.content
        // 格式化
        let reply = false
        let reg = /\[CQ:reply,qq=(\d+)\]/g
        if (reg.test(originalRetMsg)) {
            reply = true
            originalRetMsg = originalRetMsg.replace(reg, '')
        }
        // 回复
        e.reply(originalRetMsg, reply)
        // 添加记录
        messages.chat.push(message)
        messages.chat.push(response.choices[0].message)
        // 长度限制
        if (message.chat.length > setting.config.chatLong * 2) {
            messages.chat = messages.chat.slice(2)
        }
    }

    initChat(e) {
        if (!setting.config.apiKey) return //没有配置api-key
        if (e.message.filter(msg => msg.type === 'at').every(({ qq }) => qq != e.self_id)) return  // 过滤出艾特消息
        if (!(setting.config.aiInclude || []).includes(e.group_id)) return   // 过滤群聊
        if (!client) {
            client = new OpenAI({
                baseURL: setting.config.baseURL,
                apiKey: setting.config.apiKey
            })
        }
        return true
    }




}