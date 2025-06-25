import setting from '#setting'
import utils from '#utils'
import axios from 'axios'
import puppeteer from 'puppeteer'
import { bookingnum, announce, announcePage } from '../api/manjuu.js'
import { getUserInfo, getVideoInfo, getVideoOnline } from '../api/bilibili.js'
import common from '../../../lib/common/common.js'
/**
 * 新闻
 */
export class News extends plugin {
    constructor() {
        super({
            name: '[悠悠小助手]资讯',
            dsc: '悠悠资讯',
            event: 'message',
            priority: 100,
            rule: [
                {
                    reg: `^${setting.rulePrefix}?(数据(信息)?|预约(人数)?)$`,
                    fnc: 'data'
                },
                {
                    reg: `^${setting.rulePrefix}?(最新|最近|近期)?(新闻|公告|活动)$`,
                    fnc: 'announce'
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
    async announce(e) {
        const match = e.msg.match(new RegExp(`^${setting.rulePrefix}?(?:最新|最近|近期)?(.{2})$`))
        logger.info(`^${setting.rulePrefix}(?:最新|最近|近期)?(.{2})$`)
        const { total, list } = await announce({ 动态: 'latest', 新闻: 'news', 公告: 'announce', 活动: 'activity' }[match[1]])
        if (!total) {
            e.reply(`蓝原近期没有${match[1]}哦~`)
            return
        }
        // e.reply(`蓝原近期有${total}条${match[1]}哦~\n\n${list.map((v, i) => `${i + 1}.${utils.formatDate(new Date(v.show_time), 'YYYY-M-D')} ${v.title}\n${announcePage(v.id)}`).join('\n')}`)
        const browser = await puppeteer.launch({
            headless: 'new', // 使用新的 Headless 模式
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        e.reply('正在获取近期' + match[1] + ',请稍后~', true)
        let strList = [`蓝原近期有${total}条${match[1]}哦~`]
        await Promise.all(list.map(async ({ show_time, id, title }, i) => {

            const res = await axios.get(announcePage(id))
            let html = res.data
            const page = await browser.newPage();
            try {
                // 设置HTML内容
                await page.setContent(html);
                // 截取完整页面
                const image = Buffer.from(await page.screenshot({ fullPage: true }))
                logger.info(image)
                strList = strList.concat(`\n\n${i + 1}.${utils.formatDate(new Date(show_time), 'YYYY-M-D')} ${title}\n`, segment.image(image), '详情请见>>> ' + announcePage(id) + '\n')
            } catch (error) {
                logger.error(`[截图] 错误详情: ${error.stack || error}`);
            }
        }))
        logger.info(strList)
        await this.e.reply(strList)
        await common.sleep(5000)
        browser.close()
    }



}