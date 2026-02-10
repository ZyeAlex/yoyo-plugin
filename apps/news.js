import setting from '#setting'
import utils from '#utils'
import path from 'path'
import plugin from '#plugin'
import { shortUrl } from '../api/bilibili.js'

export const News = plugin({
    name: '[悠悠助手]资讯',
    event: 'message',
    priority: 9999,
    rule: [
        {
            reg: `^#?公告$`,
            fnc: notices
        },
        {
            reg: `^#?兑换码$`,
            fnc: RedemptionCode
        }
    ]
})



/**
 * 新闻
 */
async function notices(e) {
    let strs = 'BWiki近期公告\n——————————\n' + (await Promise.all(
        setting.notices.map(async ({ url, title }, index) => {
            return `${index + 1}.${title}: \n${(await shortUrl(url)).replace('https://', '')}`
        })
    )).join('\n')
    e.reply(strs)
}


const 兑换码 = ['<兑换码来源占位符>', '兑换码过期时间\n<时间占位符>', '<兑换码1>', '<兑换码2>', '<兑换码3>']

async function RedemptionCode(e) {
    e.reply(utils.makeForwardMsg(e, 兑换码, '蓝色星原·旅谣兑换码'))
}
