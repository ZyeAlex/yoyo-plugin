import setting from '#utils.setting'
import { bookingnum, announce } from '../api/manjuu.js'
import { getUserInfo, getVideoInfo } from '../api/bilibili.js'
import utils from '#utils'

let _data_cache = null
/**
 * 新闻
 */
export class news extends plugin {
    constructor() {
        super({
            name: '[悠悠小助手]资讯',
            dsc: '悠悠资讯',
            event: 'message',
            priority: 100,
            rule: [
                {
                    reg: `^${setting.rulePrefix}数据(信息)?$`,
                    fnc: 'data'
                },
                {
                    reg: `^${setting.rulePrefix}(最新|最近|近期)?新闻$`,
                    fnc: 'announce'
                },
                {
                    reg: `^${setting.rulePrefix}(最新|最近|近期)?公告$`,
                    fnc: 'announce'
                },
                {
                    reg: `^${setting.rulePrefix}(最新|最近|近期)?活动$`,
                    fnc: 'announce'
                },

            ]
        })
    }
    async data(e) {
        const [d1, d2, d3] = await Promise.allSettled([await bookingnum(), await getUserInfo(3546569016085336), await getVideoInfo('BV1Jr421n7n4')])
        let str = `——「蓝色星原旅谣」当前数据`
        if (d1.status == 'fulfilled') {
            str += `\n预约人数：${d1.value}`
        }
        if (d2.status == 'fulfilled') {
            str += `\nB站粉丝数：${d2.value.data.card.fans}`
        }
        if (d3.status == 'fulfilled') {
            str += `\nPV播放量：${d3.value.data.stat.view}`
        }
        if (_data_cache) {
            str += `\n——距离上次查询过去了${utils.formatTimeDiff(new Date().getTime() - _data_cache.time)}`
            if (_data_cache.bookingnum) {
                str += `\n预约人数增加了：${d1.value - _data_cache.bookingnum}人`
            }
            if (_data_cache.fans) {
                str += `\nB站粉丝数增加了：${d2.value.data.card.fans - _data_cache.fans}人`
            }
            if (_data_cache.pv) {
                str += `\nPV播放量增加了：${new Date(_data_cache.time).toLocaleString()}次`
            }
        }
        _data_cache = {
            time: new Date().getTime(),
            bookingnum: d1?.value,
            fans: d2?.value?.data?.card?.fans,
            pv: d3?.value?.data?.stat?.view
        }
        e.reply(str)
    }


    // 
    async announce(e) {
        const match = e.msg.match(new RegExp(`^${setting.rulePrefix}(?:最新|最近|近期)?(.{2})$`))
        logger.info(`^${setting.rulePrefix}(?:最新|最近|近期)?(.{2})$`)
        const { total, list } = await announce({ 动态: 'latest', 新闻: 'news', 公告: 'announce', 活动: 'activity' }[match[1]])
        if (!total) {
            e.reply(`蓝原近期没有${match[1]}哦~`)
            return false
        }
        e.reply(`蓝原近期有${total}条${match[1]}哦~\n\n${list.map((v, i) => `${i + 1}.${utils.formatDate(new Date(v.show_time), 'YYYY-M-D')} ${v.title}`).join('\n')}`)
        return true
    }



}