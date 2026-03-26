import setting from '#setting'
import plugin from '../../../lib/plugins/plugin.js'
function getPlugin(config) {
    const rules = []
    const funcs = []
    config.rule?.forEach((rule, index) => {
        if (typeof rule.reg == 'string') rule.reg = rule.reg.replace('#', setting.rulePrefix)
        let name = rule.fnc.name
        if (name == 'fnc') name = name + '_' + index
        rules.push({ ...rule, fnc: name })
        const f = (e) => rule.fnc(e, ...e.msg.match(typeof reg == 'string' ? new RegExp(rule.reg) : rule.reg).slice(1))
        Object.defineProperty(f, 'name', { value: name });
        funcs.push(f)
    })
    config.func?.forEach(f => {
        funcs.push(f)
    })
    class Plugin extends plugin {
        constructor() {
            super({ ...config, rule: rules })
            funcs.forEach((func) => {
                this[func.name] = func.bind(this)
            })
            config.constructor?.()
        }
    }
    return Plugin
}

export default getPlugin
