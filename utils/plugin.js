function getPlugin(config) {
    const rules = []
    const funcs = []
    let index = 1
    config.rule?.forEach((rule) => {
        let name = rule.fnc.name
        if (name == 'fnc') {
            name = name + '_' + index
            index++
        }
        rules.push({ ...rule, fnc: name })
        const f = (e) => rule.fnc(e, typeof reg == 'string' ? new RegExp(rule.reg) : rule.reg)
        Object.defineProperty(f, 'name', { value: name });
        funcs.push(f)
    })
    function Plugin() {
        funcs.forEach((func) => this[func.name] = func.bind(this))
    }
    Plugin.prototype = new plugin(Object.assign({ ...config, rule: rules }))
    Plugin.prototype.constructor = Plugin
    return Plugin
}

export default getPlugin
