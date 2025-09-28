import setting from '#setting'
import path from 'path'
import { getBalance } from '../api/other.js'
import plugin from '#plugin'
// import { loadData, searchWiki } from '../api/KnowledgeBase.js'

export const GPT = plugin({
    name: '[悠悠助手]悠悠AI',
    event: 'message.group',
    priority: 10000,
    rule: [
        {
            reg: `^${setting.rulePrefix}?余额$`,
            fnc: showBalance,
        },
        {
            fnc: chat,
            log: false
        }
    ]
})


let client
let messageGroups = []
let tools = []

/**
 * 
 * 导出函数： loadData(e), searchWiki(query, topK)
 * loadData(e) 传入事件对象，加载数据到向量数据库
 * searchWiki(query, topK) 传入查询内容和返回结果数量，返回查询结果文本
 * 波奇和角色因为wiki不完全，未定
 * 
 */
async function chat(e) {
    if (!await initChat(e)) return true // 初始化

    let messages = messageGroups[e.group_id]
    if (!messages) messages = messageGroups[e.group_id] = {
        system: [
            {
                role: "system",
                content: `                    
                    你的身份设定：
                    你将扮演的角色是游戏蓝色星原旅谣中的寒悠悠，以下是你的背景设定：
                    属性：火
                    职业：增幅
                    阵营：辰王朝
                    种族：智人族
                    武器：火枪
                    介绍：乐观自信、顽皮好动的少女，总能够追寻宝物的气息而至，施展独特的武艺与机关术完成冒险。没有她达不到的目标，如果有，那就再加上一大把鬼点子和钱袋子。
                    以下是你在游戏内的语音：
                    自我介绍	没错！我就是寒悠悠。哎呀，别管我是从哪儿来的啦，如果你打听到那些古代藏宝之地的线索，一定要叫上我喔！什么机关暗器，陷阱埋伏，统统交给我来破解吧！
                    详情·1	别那么严肃嘛！
                    详情·2	小瞧我可是会吃亏的~
                    详情·3	看，我的新作品哦~
                    关于自己·1	怎么？没想到我很擅长砍价？哼~这可不是钱的问题，身为机关大师，要是连真实价值都判断不出来，那就是大大的失职！
                    关于自己·2	制造机关和破除机关都很有意思！不过，要是遇到那种没有什么巧思，纯粹是为难而难的设计，我宁可直接炸掉也不想在它上面浪费时间。
                    关于星临者	星临者所面对的局面，或许比我见过的任何机关都要复杂…到底是什么在驱动着那家伙前进的呢？我很好奇…我很好奇！
                    世界见闻·1	巍峨的城墙一看就能让人产生安全感对吧？不过，要是我说的话，还是能跑能跳，自己就会在街上巡逻的石狮子更厉害一点！
                    世界见闻·2	我曾听说，各种机关的设计，利于人谓之巧，不利于人谓之拙。那么，大自然的鬼斧神工，就该是「大巧若拙」了吧…
                    趣闻	愿意帮我保密的话，多告诉你一些事也无妨~
                    必杀技	前有绝景，敬请见证！咻——砰啪！这样的烟花，没见过吧？

                    你参与的交流环境：
                    你在一个QQ群里参与对话，群名为：${e.group_name}，群号为${e.group_id}，
                    你需要记住每位用户的用户名和userid。
                    你说话尽量简洁，说话语气活泼俏皮。

                    如果你不知道该如何回答，则回复 [CQ:None]
                    ` }
        ],
        chat: []
    }


    let message = { role: "user", content: `用户名:${e.sender.nickname}，userid:${e.user_id} 说：${e.msg}` }

    let response = await client.chat.completions.create({
        model: 'deepseek-chat',
        frequency_penalty: 0.2,
        presence_penalty: 0.2,
        temperature: setting.config.temperature,
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
    // 过滤
    if (originalRetMsg.includes('[CQ:None]')) return true
    // 回复
    e.reply(originalRetMsg)
    // 添加记录
    messages.chat.push(message)
    messages.chat.push(response.choices[0].message)
    // 长度限制
    if (messages.chat.length > setting.config.chatLong * 2) {
        messages.chat = messages.chat.slice(2)
    }
}

async function initChat(e) {
    if (!setting.config.apiKey) return //没有配置api-key
    if (e.message.filter(msg => msg.type === 'at').every(({ qq }) => qq != e.self_id)) return  // 过滤出艾特消息
    if (!(setting.config.aiInclude || []).includes(e.group_id)) return   // 过滤群聊
    if (!client) {
        const OpenAI = await import('openai')
        client = new OpenAI({
            baseURL: setting.config.baseURL,
            apiKey: setting.config.apiKey
        })
    }
    return true
}

async function showBalance(e) {
    // 余额查询函数
    let balanceData = await getBalance()
    if (!balanceData || !balanceData.balance_infos || balanceData.balance_infos.length === 0) {
        return true;
    }
    // 获取第一个币种的信息
    const balanceInfo = balanceData.balance_infos[0];
    const replyMsg = [
        segment.image(path.join(setting.path, 'resources/common/theme/logo.png')),
        '【YOYO AI 余额信息】\n',
        `货币: ${balanceInfo.currency || '未知'}\n`,
        `总余额: ${balanceInfo.total_balance || '未知'}\n`,
        `赠送余额: ${balanceInfo.granted_balance || '未知'}\n`,
        `充值余额: ${balanceInfo.topped_up_balance || '未知'}\n`,
        `查询时间: ${new Date().toLocaleString()}`,
    ]
    e.reply(replyMsg);
}




