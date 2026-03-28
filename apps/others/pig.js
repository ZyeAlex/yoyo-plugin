import plugin from '#plugin'
import lodash from "lodash"
import render from '#render'

export const Pig = plugin({
    name: '[悠悠助手]你是什么猪',
    event: 'message.group',
    priority: 9999,
    rule: [
        {
            reg: "^#?(他|她|它|你|我|这|ta)?是?什么(猪|🐷){1,2}[?？]?$",
            fnc: which
        }
    ]
})


const pigConfig = [
    {
        id: "human",
        name: "人类",
        description: "检测不出猪元素，是人类吗？",
    },
    {
        id: "pig",
        name: "猪",
        description: "普通小猪",
    },
    {
        id: "black-pig",
        name: "小黑猪",
        description: "小黑猪，卤出猪脚了",
    },
    {
        id: "wild-boar",
        name: "野猪",
        description: "是一只勇猛的野猪！",
    },
    {
        id: "zhuge-liang",
        name: "猪葛亮",
        description: "猪里最聪明的一个",
    },
    {
        id: "pig-stamp",
        name: "猪圆章",
        description: "《猪圈那些事》",
    },
    {
        id: "zombie-pig",
        name: "僵尸猪",
        description: "喜欢的食物是猪脑",
    },
    {
        id: "skeleton-pig",
        name: "骷髅猪",
        description: "资深不死族",
    },
    {
        id: "pig-human",
        name: "猪人",
        description: "你是猪还是人？",
    },
    {
        id: "demon-pig",
        name: "恶魔猪",
        description: "满肚子坏心眼",
    },
    {
        id: "heaven-pig",
        name: "天堂猪",
        description: "似了喵~",
    },
    {
        id: "explosive-pig",
        name: "爆破小猪",
        description: "我跟你爆了！",
    },
    {
        id: "black-white-pig",
        name: "黑白猪",
        description: "串子",
    },
    {
        id: "pork-skewer",
        name: "猪肉串",
        description: "真正的串子",
    },
    {
        id: "magic-pig",
        name: "魔法少猪",
        description: "马猪烧酒",
    },
    {
        id: "mechanical-pig",
        name: "机械猪",
        description: "人机",
    },
    {
        id: "pig-ball",
        name: "猪猪球",
        description: "滚了",
    },
    {
        id: "doll-pig",
        name: "玩偶猪",
        description: "fufu小猪",
    },
    {
        id: "soul-pig",
        name: "灵魂猪",
        description: "从冥界归来的猪",
    },
    {
        id: "crystal-pig",
        name: "水晶猪",
        description: "珍贵又脆弱的小猪",
    },
    {
        id: "snow-pig",
        name: "雪猪",
        description: "洁白的雪猪",
    },
    {
        id: "pig-cat",
        name: "猪咪",
        description: "是一只可爱的猪咪！",
    }
];




async function which(e) {
    let userid = e.user_id, username = e.sender.nickname || e.sender.card || '你'
    let at = e.message.find(item => item.type == 'at')
    if (at) {
        userid = at.qq
        username = at.name
    }

    const pig = lodash.sample(pigConfig)   // 选择一只猪
    await render(e, 'pig/index', {
        userimg: `http://q2.qlogo.cn/headimg_dl?dst_uin=${userid}&spec=5`,
        username: username,
        pig
    }, { origin: '我睡不醒' })
}
