import plugin from '#plugin'
import setting from '#setting'
import OpenAI from "openai"
// AI配置
const openai = new OpenAI({
    baseURL: setting.config.baseURL,
    apiKey: setting.config.apikey,
});


// 类型概率配置,总和1
const reply_text_rate = 0.5  // 回复文字概率
const reply_image_rate = 0.5 // 回复图片概率
const reply_voice_rate = 0 // 回复语音概率

// 以上类型中特殊来源概率配置
const reply_text_ai_rate = 0.5    // AI回复概率
const reply_external_cos_rate = 0 // 外部图片回复概率(如cos)

// 其他配置
const botIds = [1234, 1234] // 标记bot，防止左脚踩右脚互相戳
const mood = [
    '开心的(>ω<)',
    '难过的(〒︿〒)',
    '生气的(╬￣皿￣)=○#(￣～￣;)',
    '无聊的(￣︶￣)',
    '困惑的(⊙_⊙;)',
    '兴奋的(≧∇≦)/',
    '平静的(￣ー￣)',
]
const word_list = [// 固有文本回复列表
    '1',
    '2',
    '3',
    '4',
    '5',
]
export const Help = plugin({
    name: '[悠悠助手]戳一戳',
    event: 'notice.group.poke',
    priority: 9999,
    rule: [
        {
            /** 命令正则匹配 */
            fnc: poke,
            log: false
        }
    ]
})


async function poke(e) {

    return

    //忽略机器人戳
    if (botIds.includes(e.operator_id)) return;

    if (e.target_id == e.self_id) {
        let random_type = Math.random()
        // 文字回复
        if (random_type < reply_text_rate) {
            if (Math.random() < reply_text_ai_rate) {
                // AI回复
                e.reply(await AI())
            } else {
                // 固有文本回复
                let text_number = Math.ceil(Math.random() * word_list['length'])
                e.reply(word_list[text_number - 1])
            }
        }

        //图片回复
        else if (random_type < reply_text_rate + reply_image_rate) {
            if (Math.random() < reply_external_cos_rate) {
                // 外部图片回复

            } else {
                // 表情包回复
                await IMAGE()

            }
        }

        //语音回复
        else if (random_type < reply_text_rate + reply_image_rate + reply_voice_rate) {
            // 或许是使用TTS合成语音回复
        }
    }

}

// 功能函数
// AI回复函数
async function AI() {
    let this_mood = mood[Math.ceil(Math.random() * mood.length) - 1]
    const prompt = `你是一只名叫罐头的小猫咪，你现在的心情是${this_mood}，请根据这个心情来回复用户。每句话结尾都要加一个喵字。`
    const user_input = `用户名:${e.sender.nickname}，userid:${e.user_id} 戳了一下你，你要根据你的心情并且使用不超过8个字来回复他喵。}。`

    const completion = await openai.chat.completions.create({
        messages: [{ role: "system", content: `${prompt}` }, { role: "user", content: `${user_input}` }],
        model: "deepseek-chat",
    });
    return completion.choices[0].message.content.trim()
}

// 图片回复函数
async function IMAGE() {
    return
}