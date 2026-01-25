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
        const f = (e) => rule.fnc(e, typeof reg == 'string' ? new RegExp(rule.reg) : rule.reg)
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
        }
    }
    return Plugin
}

export default getPlugin
