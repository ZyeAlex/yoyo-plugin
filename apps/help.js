import render from '#render'
import setting from '#setting'

export class Help extends plugin {
  constructor() {
    super({
      name: '[悠悠助手]帮助',
      event: 'message',
      priority: 1000,
      rule: [
        {
          reg: `^(${setting.rulePrefix}|悠悠|yy|yoyo)?(帮助|help|小?助手|菜单|功能)$`,
          fnc: 'help'
        },
        {
          reg: `^(${setting.rulePrefix}|悠悠|yy|yoyo)?(wiki|Wiki|WIKI|图鉴)(帮助|help|小?助手)$`,
          fnc: 'helpWiki'
        },
        {
          reg: `^${setting.rulePrefix}test$`,
          fnc: 'test'
        },
      ]
    })
  }

  async help(e) {
    let { helpGroup } = setting.getData('help')
    helpGroup = helpGroup.filter(({ auth }) => {
      return auth ? e.isMaster : true
    })
    return await render(e, 'help/index', {
      helpGroup
    })
  }
  async helpWiki(e) {
    const { helpGroup } = setting.getData('help')
    return await render(e, 'help/wiki', {
      helpGroup
    })
  }
  async test(e) {
    return await render(e, 'help/test', {})
  }
}