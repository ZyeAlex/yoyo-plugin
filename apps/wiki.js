import render from '#render'
import setting from '#setting'

export class Help extends plugin {
    constructor() {
        super({
            name: '[悠悠小助手]Wiki',
            dsc: '悠悠Wiki',
            event: 'message',
            priority: 100,
            rule: [
                {
                    reg: `^(${setting.rulePrefix}|悠悠|yy|yoyo)?(Wiki|wiki)(帮助|help|小?助手)$`,
                    fnc: 'help'
                },
            ]
        })
    }
    help(e) {

    }
}