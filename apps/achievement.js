import render from '#render'
import setting from '#setting'

export class Help extends plugin {
    constructor() {
        super({
            name: '[悠悠助手]成就',
            event: 'message',
            priority: 100,
            rule: [
                {
                    reg: `^${setting.rulePrefix}?(成就列表|成就图鉴|全部成就)$`,
                    fnc: 'achievementList'
                },
            ]
        })
    }
    // 成就列表
    async achievementList(e) {
        return await render(e, 'achievement/list', {
            num: setting.achievements.reduce((num, { achievement }) => num += achievement.length, 0),
            achievements: setting.achievements
        })
    }
}