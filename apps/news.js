import setting from '#setting'
import utils from '#utils'
import path from 'path'
import plugin from '#plugin'
import { bookingnum } from '../api/manjuu.js'
import { getUserInfo, getVideoInfo, getVideoOnline, shortUrl } from '../api/bilibili.js'

export const News = plugin({
    name: '[悠悠助手]资讯',
    event: 'message',
    priority: 1000,
    rule: [
        {
            reg: `^${setting.rulePrefix}?(数据(信息)?|预约(人数)?)$`,
            fnc: data
        },
        {
            reg: `^${setting.rulePrefix}?公告$`,
            fnc: notices
        },
        {
            reg: `^${setting.rulePrefix}?兑换码$`,
            fnc: RedemptionCode
        }
    ]
})



/**
 * 新闻
 */

async function data(e) {
    const [d1, d2, ...PVs] = await Promise.allSettled([await bookingnum(), await getUserInfo(3546569016085336), ...setting.config.PVList.map(async (bvid) => await getVideoInfo(bvid))])
    let arr = [
        segment.image(path.join(setting.path, 'resources/common/theme/logo.png')),
        `🍀\t当前数据\t`
    ]
    if (d1.status == 'fulfilled') {
        arr.push(`\n预约人数：${d1.value}`)
    }
    if (d2.status == 'fulfilled') {
        arr.push(`\nB站粉丝数：${d2.value.data.card.fans}`)
    }
    let obj = {}
    for (let i = 0; i < PVs.length; i++) {
        const { value: { data: { bvid, cid, stat: { view } } } } = PVs[i]
        const { data: { total } } = await getVideoOnline(bvid, cid)
        obj['PV' + (i + 1)] = view
        arr.push(`\nPV${i + 1}数据：${view}(${total})`)
    }
    let _data_cache = await redis.get('yoyo:news:data')
    let _date_diff = utils.formatTimeDiff(new Date().getTime() - _data_cache.time, 'm')
    if (_data_cache && _date_diff) {
        _data_cache = JSON.parse(_data_cache)
        arr.push(`\n🍀 距离上次查询${_date_diff} `)
        if (_data_cache.bookingnum !== d1.value) {
            arr.push(`\n预约人数增加了：${d1.value - _data_cache.bookingnum}人`)
        }
        if (_data_cache.fans !== d2.value.data.card.fans) {
            arr.push(`\nB站粉丝数增加了：${d2.value.data.card.fans - _data_cache.fans}人`)
        }
        PVs.forEach(({ value: { data: { stat: { view } } } }, index) => {
            let viewCache = _data_cache['PV' + (index + 1)]
            if (viewCache && viewCache != view) {
                arr.push(`\nPV${index + 1}播放量增加了：${view - viewCache}次`)
            }
        })
    }
    redis.set('yoyo:news:data', JSON.stringify({
        time: new Date().getTime(),
        bookingnum: d1?.value,
        fans: d2?.value?.data?.card?.fans,
        ...obj
    }))
    e.reply(arr)
}


// 
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
