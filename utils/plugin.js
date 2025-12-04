import setting from '#setting'
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
    function Plugin() {
        funcs.forEach((func) => this[func.name] = func.bind(this))
    }
    Plugin.prototype = new plugin({ ...config, rule: rules })
    Plugin.prototype.constructor = Plugin
    return Plugin
}

export default getPlugin
