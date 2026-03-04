import render from '#render'
import setting from '#setting'
import plugin from '#plugin'
import utils from '#utils'
export const Help = plugin({
  name: '[悠悠助手]帮助',
  event: 'message',
  priority: 100,
  rule: [
    {
      reg: `^(#|悠悠|yy|yoyo)?(帮助|help|小?助手|菜单|功能)$`,
      fnc: help
    }
  ]
})

async function help(e) {
  let { helpGroup } = setting.getData('config/help')
  helpGroup = helpGroup.filter(({ auth }) => utils.checkPermission(e, auth, false))
  await render(e, 'help/index', {
    helpGroup
  })
}