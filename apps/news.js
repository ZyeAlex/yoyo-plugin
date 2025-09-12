import setting from '#setting'
import utils from '#utils'
import { bookingnum } from '../api/manjuu.js'
import { getUserInfo, getVideoInfo, getVideoOnline, shortUrl } from '../api/bilibili.js'

const 兑换码 = ['<兑换码来源占位符>', '兑换码过期时间\n<时间占位符>', '<兑换码1>', '<兑换码2>', '<兑换码3>']

/**
 * 新闻
 */
export class News extends plugin {
    constructor() {
        super({
            name: '[悠悠助手]资讯',
            event: 'message',
            priority: 1000,
            rule: [
                {
                    reg: `^${setting.rulePrefix}?(数据(信息)?|预约(人数)?)$`,
                    fnc: 'data'
                },
                {
                    reg: `^${setting.rulePrefix}?公告$`,
                    fnc: 'notices'
                },
                {
                    reg: `^${setting.rulePrefix}?兑换码$`,
                    fnc: 'RedemptionCode'
                }
            ]
        })
    }
    async data(e) {
        const [d1, d2, ...PVs] = await Promise.allSettled([await bookingnum(), await getUserInfo(3546569016085336), ...setting.config.PVList.map(async (bvid) => await getVideoInfo(bvid))])
        let str = `——「蓝色星原旅谣」当前数据`
        if (d1.status == 'fulfilled') {
            str += `\n预约人数：${d1.value}`
        }
        if (d2.status == 'fulfilled') {
            str += `\nB站粉丝数：${d2.value.data.card.fans}`
        }
        let obj = {}
        for (let i = 0; i < PVs.length; i++) {
            const { value: { data: { bvid, cid, stat: { view } } } } = PVs[i]
            const { data: { total } } = await getVideoOnline(bvid, cid)
            obj['PV' + (i + 1)] = view
            str += `\nPV${i + 1}数据：${view}(${total})`
        }
        let _data_cache = await redis.get('yoyo:news:data')
        if (_data_cache) {
            _data_cache = JSON.parse(_data_cache)
            str += `\n—— 距离上次查询${utils.formatTimeDiff(new Date().getTime() - _data_cache.time)}`
            if (_data_cache.bookingnum !== d1.value) {
                str += `\n预约人数增加了：${d1.value - _data_cache.bookingnum}人`
            }
            if (_data_cache.fans !== d2.value.data.card.fans) {
                str += `\nB站粉丝数增加了：${d2.value.data.card.fans - _data_cache.fans}人`
            }
            PVs.forEach(({ value: { data: { stat: { view } } } }, index) => {
                let viewCache = _data_cache['PV' + (index + 1)]
                if (viewCache && viewCache != view) {
                    str += `\nPV${index + 1}播放量增加了：${view - viewCache}次`
                }
            })
        }
        redis.set('yoyo:news:data', JSON.stringify({
            time: new Date().getTime(),
            bookingnum: d1?.value,
            fans: d2?.value?.data?.card?.fans,
            ...obj
        }))
        e.reply(str)
    }


    // 
    async notices(e) {
        let strs = 'BWiki近期公告\n——————————\n' + (await Promise.all(
            setting.notices.map(async ({ url, title }, index) => {
                return `${index + 1}.${title}: \n${(await shortUrl(url)).replace('https://', '')}`
            })
        )).join('\n')
        e.reply(strs)
    }


    async RedemptionCode(e) {
        e.reply(utils.makeForwardMsg(e, 兑换码, '蓝色星原·旅谣兑换码'))
    }
}