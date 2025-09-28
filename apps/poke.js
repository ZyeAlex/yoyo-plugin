import plugin from '#plugin'

export const Help = plugin({
    name: '[悠悠助手]戳一戳',
    event: 'notice.group.poke',
    priority: 9999,
    rule: [
        {
            /** 命令正则匹配 */
            fnc: poke,
            log: false
        }
    ]
})


function poke(e){

}
