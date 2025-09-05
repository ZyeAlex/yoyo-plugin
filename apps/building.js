import render from '#render'
import setting from '#setting'

export class Help extends plugin {
    constructor() {
        super({
            name: '[悠悠助手]建造',
            event: 'message',
            priority: 100,
            rule: [
                {
                    reg: `^${setting.rulePrefix}?(装备图鉴|建造图鉴|全部建造)$`,
                    fnc: 'buildingList'
                },
            ]
        })
    }
    //   装备图鉴
    async buildingList(e) {
        return await render(e, 'building/list', {
            buildings:setting.buildings
        })
    }
}