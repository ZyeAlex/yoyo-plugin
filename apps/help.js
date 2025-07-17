import render from '#render'
import setting from '#setting'

export class Help extends plugin {
  constructor() {
    super({
      name: '[悠悠小助手]帮助',
      dsc: '悠悠帮助',
      event: 'message',
      priority: 1000,
      rule: [
        {
          reg: `^(${setting.rulePrefix}|悠悠|yy|yoyo)?(帮助|help|小?助手)$`,
          fnc: 'help'
        },
      ]
    })
  }

  async help(e) {
    const { helpGroup } = setting.getData('help')
    return await render(e, 'help/index', {
      helpCfg: {
        title: setting.config.title,
        subTitle: setting.config.subTitle
      },
      helpGroup
    })
  }
}