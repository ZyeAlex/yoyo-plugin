import render from '#render'
import setting from '#setting'
import plugin from '#plugin'

export const Help = plugin({
  name: '[悠悠助手]帮助',
  event: 'message',
  priority: 1000,
  rule: [
    {
      reg: `^(${setting.rulePrefix}|悠悠|yy|yoyo)?(帮助|help|小?助手|菜单|功能)$`,
      fnc: help
    }
  ]
})

async function help(e) {
  let { helpGroup } = setting.getData('help')
  helpGroup = helpGroup.filter(({ auth }) => {
    return auth ? e.isMaster : true
  })
  return await render(e, 'help/index', {
    helpGroup
  })
}