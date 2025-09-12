import render from '#render'
import setting from '#setting'



export class Help extends plugin {
    constructor() {
        super({
            name: '[悠悠助手]悠悠AI',
            event: 'message',
            priority: 100,
            rule: []
        })

        Bot.on("message.group", e => {
            if (e.message) {

            }
        });

    }

}