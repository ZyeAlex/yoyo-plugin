import utils from '#utils'
import plugin from '#plugin'

export const News = plugin({
    name: '[悠悠助手]资讯',
    event: 'message',
    priority: 9999,
    rule: [
        {
            reg: `^#兑换码$`,
            fnc: RedemptionCode
        }
    ]
})

const 兑换码 = ['<兑换码来源占位符>', '兑换码过期时间\n<时间占位符>', '<兑换码1>', '<兑换码2>', '<兑换码3>']

async function RedemptionCode(e) {
    e.reply(utils.makeForwardMsg(e, 兑换码, '蓝色星原·旅谣兑换码'))
}
