import runtimeRender from '../utils/runtime-render.js'
import setting from '#ap.setting'

export class help extends plugin {
  constructor() {
    super({
      name: '[悠悠助手]帮助',
      dsc: '悠悠帮助',
      event: 'message',
      priority: 100,
      rule: [
        {
          reg: `^${setting.rulePrefix}(帮助|help)$`,
          fnc: 'help'
        },
      ]
    })
  }

  async help(e) {
    const { helpGroup } = setting.getData('help')
    return await runtimeRender(e, 'help/index', {
      helpCfg: {
        title: setting.config.title,
        subTitle: setting.config.subTitle
      },
      helpGroup,
    }, {
      scale: 1.6
    })
  }
}