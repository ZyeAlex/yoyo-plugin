import render from '#render'
import setting from '#setting'

export class Help extends plugin {
    constructor() {
        super({
            name: '[悠悠助手]戳一戳',
            event: 'notice.group.poke',
            priority: 100,
            rule: [
                {
                    /** 命令正则匹配 */
                    fnc: 'poke'
                }
            ]
        })
    }
    poke(e){
        
    }
}