import setting from '#setting'
import render from '#render'
import utils from '#utils'

/**
 * 活动日历
 */
export class Calendar extends plugin {
    constructor() {
        super({
            name: '[悠悠助手]活动日历',
            event: 'message',
            priority: 100,
            rule: [
                {
                    reg: `^${setting.rulePrefix}?活动日历$`,
                    fnc: 'showCalendar'
                },
                {
                    reg: `^${setting.rulePrefix}?日历$`,
                    fnc: 'showCalendar'
                },
                {
                    reg: `^${setting.rulePrefix}?活动$`,
                    fnc: 'showCalendar'
                }
            ]
        })
    }

    async showCalendar(e) {
        try {
            const now = new Date()
            const currentDate = now.toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long'
            })

            // 模拟活动数据
            const data = {
                currentDate,
                characterEvents: [
                    {
                        title: '帕朵限时UP',
                        description: '五星角色帕朵概率提升',
                        dateRange: '2025-01-15 00:00 - 2025-01-17 00:22',
                        status: 'active',
                        statusText: '进行中',
                        logos: [
                            'https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/Pardofelis/Pardofelis_1.webp',
                            'https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/Pardofelis/Pardofelis_1.webp',
                            'https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/Pardofelis/Pardofelis_1.webp'
                        ]
                    },
                    {
                        title: '帕朵限时UP',
                        description: '五星角色帕朵概率提升',
                        dateRange: '2025-01-15 00:00 - 2025-01-17 00:22',
                        status: 'upcoming',
                        statusText: '即将开始',
                        logos: [
                            'https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/Pardofelis/Pardofelis_1.webp',
                            'https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/Pardofelis/Pardofelis_1.webp',
                            'https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/Pardofelis/Pardofelis_1.webp'
                        ]
                    }
                ],
                petEvents: [
                    {
                        title: '罐头限时UP',
                        description: '小罐头喵喵喵',
                        dateRange: '2025-01-15 00:00:00 - 2025-01-17 00:22:22',
                        status: 'active',
                        statusText: '进行中',
                        logos: [
                            'https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/status_bg.jpg',
                            'https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/status_bg.jpg',
                            'https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/status_bg.jpg'
                        ]
                    },
                    {
                        title: '罐头限时UP',
                        description: '小罐头喵喵喵',
                        dateRange: '2025-01-15 00:00:00 - 2025-01-17 00:22:22',
                        status: 'ended',
                        statusText: '已结束',
                        logos: [
                            'https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/status_bg.jpg',
                            'https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/status_bg.jpg',
                            'https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/status_bg.jpg'
                        ]
                    }
                ],
                weaponEvents: [
                    {
                        title: '往世的空梦·夜之瞳限时UP',
                        description: '小心，天上要下猫咯',
                        dateRange: '2025-01-15 00:00:00 - 2025-01-17 00:22:22',
                        status: 'active',
                        statusText: '进行中',
                        logos: [
                            'https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/status_bg.jpg',
                            'https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/status_bg.jpg',
                            'https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/status_bg.jpg'
                        ]
                    },
                    {
                        title: '往世的空梦·夜之瞳限时UP',
                        description: '小心，天上要下猫咯',
                        dateRange: '2025-01-15 00:00:00 - 2025-01-17 00:22:22',
                        status: 'active',
                        statusText: '进行中',
                        logos: [
                            'https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/status_bg.jpg',
                            'https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/status_bg.jpg',
                            'https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/status_bg.jpg'
                        ]
                    }
                ],
                activityEvents: [
                    {
                        title: '1活动1',
                        description: '探索神秘的111',
                        duration: '2024-01-15 至 2024-01-30',
                        rewards: '111',
                        date: { day: '15', month: '1月', year: '2024' },
                        status: 'active',
                        statusText: '进行中'
                    },
                    {
                        title: '1活动1',
                        description: '探索神秘的111',
                        duration: '2024-01-15 至 2024-01-30',
                        rewards: '111',
                        date: { day: '15', month: '1月', year: '2024' },
                        status: 'upcoming',
                        statusText: '即将开始'
                    },
                    {
                        title: '1活动1',
                        description: '探索神秘的111',
                        duration: '2024-01-15 至 2024-01-30',
                        rewards: '111',
                        date: { day: '15', month: '1月', year: '2024' },
                        status: 'active',
                        statusText: '进行中'
                    },
                    {
                        title: '好的1',
                        description: 'Thanks♪(･ω･)ﾉ',
                        duration: '2024-01-10 至 2024-01-17',
                        rewards: '8888888888',
                        date: { day: '10', month: '1月', year: '2024' },
                        status: 'ended',
                        statusText: '已结束'
                    }
                ]
            }

            // 渲染页面
            return await render(e, 'calendar/index', data)
        } catch (error) {
            logger.error('[yoyo-plugin][活动日历渲染失败]', error)
            return e.reply('活动日历渲染失败，请稍后重试')
        }
    }


}
