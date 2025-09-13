import setting from '#setting'
import render from '#render'
import utils from '#utils'


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

            const calendarData = {
                pageTitle: "蓝色星原·旅谣 | 活动日历 | yoyo-plugin",
                currentDate,

                // 卡池列表
                upPools: [
                    {
                        title: "角色UP卡池",
                        startDate: "2025-09-13 00:00:00",
                        endDate: "2025-09-20 23:59:59",

                        items: [
                            "https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/Pardofelis/Pardofelis_1.webp",
                            "https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/Pardofelis/Pardofelis_1.webp"
                        ]
                    },
                    {
                        title: "武器UP卡池",
                        startDate: "2025-09-13 00:00:00",
                        endDate: "2025-09-20 23:59:59",

                        items: [
                            "https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/Pardofelis/Pardofelis_1.webp",
                            "https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/Pardofelis/Pardofelis_1.webp"
                        ]
                    },
                    {
                        title: "宠物UP卡池",
                        startDate: "2025-09-13 00:00:00",
                        endDate: "2025-09-20 23:59:59",

                        items: [
                            "https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/Pardofelis/Pardofelis_1.webp",
                            "https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/Pardofelis/Pardofelis_1.webp"
                        ]
                    }
                ],

                // 活动列表
                activityEvents: [
                    {
                        title: "限时秘境活动",
                        startDate: "09.13 04:00",
                        endDate: "09.20 23:59",
                        logo: "https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/Pardofelis/Pardofelis_1.webp"
                    },
                    {
                        title: "周末特别活动",
                        startDate: "09.14 00:00",
                        endDate: "09.15 23:59",
                        logo: "https://gitee.com/Elvin-Apocalys/pic-bed/raw/master/Pardofelis/Pardofelis_1.webp"
                    }
                ]
            };



            // 渲染页面
            return await render(e, 'calendar/index', getDurations(calendarData),)
        } catch (error) {
            logger.error('[yoyo-plugin][活动日历渲染失败]', error)
            return e.reply('活动日历渲染失败，请稍后重试')
        }
    }


}

// 计算剩余时间并返回新的对象
function getDurations(data) {
    const now = new Date();

    // 处理卡池
    const upPools = data.upPools.map(pool => {
        const start = new Date(pool.startDate);
        const end = new Date(pool.endDate);
        const status = getStatus(now, start, end);
        const duration = formatDuration(now, start, end);
        return {
            ...pool,
            status,
            duration
        };
    });

    // 处理活动
    const activityEvents = data.activityEvents.map(evt => {
        const start = new Date(evt.startDate);
        const end = new Date(evt.endDate);
        const status = getStatus(now, start, end);
        const duration = formatDuration(now, start, end);
        return {
            ...evt,
            status,
            duration
        };
    });

    return {
        ...data,
        upPools,
        activityEvents
    };
}

// 判断状态
function getStatus(now, start, end) {
    if (now < start) return "未开始";
    if (now > end) return "已结束";
    return "进行中";
}

// 将毫秒差值格式化为 天/小时/分钟/秒
function formatDuration(now, start, end) {
    if (now < start) return { text: "未开始", status: "not-started" };
    if (now > end) return { text: "已结束", status: "ended" };
    const diff = end - now;
    const d = Math.floor(diff / 1000 / 60 / 60 / 24);
    const h = Math.floor(diff / 1000 / 60 / 60 % 24);
    const m = Math.floor(diff / 1000 / 60 % 60);
    const s = Math.floor(diff / 1000 % 60);

    // 根据剩余时间设置不同状态
    let status = "normal"; // 默认状态
    if (d <= 1) status = "urgent"; // 1天内显示紧急状态
    else if (d <= 3) status = "warning"; // 3天内显示警告状态

    return {
        text: `${d}天 ${h}小时 ${m}分 ${s}秒`,
        status: status
    };
}
