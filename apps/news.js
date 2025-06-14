import setting from '#utils.setting'
import { bookingnum, announce } from '#api.manjuu'
import utils from '#utils'

let _reservation_cache = null

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
                    reg: `^${setting.rulePrefix}(全平台)?预约(人数|量)$`,
                    fnc: 'reservation'
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

    _reservation_cache = null
    // 预约人数
    async reservation(e) {
        try {
            const data = await bookingnum()
            let str = '《蓝色星原旅谣》当前全平台预约人数：【' + data + "】人"
            logger.info(_reservation_cache?.num)
            logger.info(data)
            if (_reservation_cache && _reservation_cache.num != data) {
                str += `\n距离上次查询过去了【${utils.formatTimeDiff(new Date().getTime() - _reservation_cache.time)}】，订阅数增加了【${data - _reservation_cache.num}】人`
            }
            _reservation_cache = {
                time: new Date().getTime(),
                num: data
            }
            e.reply(str)
        } catch (error) {
            logger.error(error)
            e.reply('没有查到哦~')
        }
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
        e.reply(`蓝原近期有${total}条${match[1]}哦~\n\n${list.map((v, i) => `${i + 1}.${utils.formatDate(new Date(v.show_time),'YYYY-M-D') } ${v.title}`).join('\n')}`)
        return true
    }



}