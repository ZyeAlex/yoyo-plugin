import setting from '#setting'
import render from '#render'
import lodash from 'lodash'
export class Pet extends plugin {
    constructor() {
        super({
            name: '[悠悠小助手]奇波',
            dsc: '悠悠奇波',
            event: 'message',
            priority: 102,
            rule: [
                {
                    reg: `^${setting.rulePrefix}?(奇波列表|全部奇波|所有奇波)$`,
                    fnc: 'petList'
                },
            ]
        })
    }
    // 奇波列表
    async petList(e) {
        let pets = Object.values(setting.pets)
        pets = pets.filter(({ petIcon }) => petIcon)
        return await render(e, 'pet/list', {
            pets,
            length: pets.length,
            petImg: lodash.sample(pets).kiboBoxCardIcon[2]
        })
    }
}