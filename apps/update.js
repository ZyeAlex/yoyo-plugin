import { execSync } from 'child_process'
import plugin from '../../../lib/plugins/plugin.js'
import { update } from '../../other/update.js'
import setting from '#setting'

export class ql_update extends plugin {
  constructor() {
    super({
      name: '[悠悠小助手]更新',
      dsc: '更新',
      event: 'message',
      priority: 2000,
      rule: [
        {
          reg: `^${setting.rulePrefix}(强制)?更新$`,
          fnc: 'update_plugin',
          permission: 'master'
        },
        {
          reg: `${setting.rulePrefix}更新日志$`,
          fnc: 'update_log'
        }
      ]
    })
  }

  async update_plugin() {
    let Update_Plugin = new update()
    Update_Plugin.e = this.e
    Update_Plugin.reply = this.reply

    if (Update_Plugin.getPlugin(setting.config.name)) {
      if (this.e.msg.includes('强制')) {
        await execSync('git reset --hard', { cwd: `${process.cwd()}/plugins/${setting.config.name}/` })
      }
      await Update_Plugin.runUpdate(setting.config.name)
      if (Update_Plugin.isUp) {
        setTimeout(() => Update_Plugin.restart(), 2000)
      }
    }
    return true
  }

  async update_log() {
    let Update_Plugin = new update()
    Update_Plugin.e = this.e
    Update_Plugin.reply = this.reply

    if (Update_Plugin.getPlugin(setting.config.name)) {
      this.e.reply(await Update_Plugin.getLog(setting.config.name))
    }
    return true
  }

}
