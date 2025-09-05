import render from '#render'
import setting from '#setting'
export class Help extends plugin {
    constructor() {
        super({
            name: '[悠悠助手]食物',
            event: 'message',
            priority: 100,
            rule: [
                {
                    reg: `^${setting.rulePrefix}?(食(物|品)列表|食(物|品)图鉴|全部食(物|品))$`,
                    fnc: 'foodList'
                },
            ]
        })
    }
    // 食品列表
    async foodList(e) {
        return await render(e, 'food/list', {
            foods: setting.foods
        })
    }
}