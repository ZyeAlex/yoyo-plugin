import setting from '#setting'
import plugin from '#plugin'

export const Settings = plugin({
    name: '[悠悠助手]设置',
    event: 'message',
    priority: 100,
    rule: [
        {
            reg: `^#设置(.{1,10})$`,
            fnc: settings
        }
    ]
})

async function settings(e,reg) {
    if (!e.isMaster)  return 
    let match = e.msg.match(reg)
    if (match) {
        let text = match[1].slice(0, 10)
        if (text.includes(`覆盖帮助`)) {
            if (text.endsWith(`覆盖帮助`)) return
            let match1 = text.match(/(.*)覆盖帮助(开启|关闭)(.*)/)
            let action1 = match1[2]
            helpPriority(action1)
            setting.setData('config/config', setting.config)
            await e.reply(`覆盖帮助： ${action1}\n请执行#重启以应用`)
        }
    }

}

function helpPriority(action) {
    if (action.includes(`开启`)) {
        setting.config.help = true

    }
    else if (action.includes(`关闭`)) {
        setting.config.help = false
    }
}