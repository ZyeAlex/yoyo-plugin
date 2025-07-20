import { execSync } from 'child_process'
import plugin from '../../../lib/plugins/plugin.js'
import { update } from '../../other/update.js'
import setting from '#setting'

export class Update extends plugin {
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
        },
        {
          reg: `${setting.rulePrefix}?(删除|清除|清空|重置)(无效|脏)数据$`,
          fnc: 'clearErrorData'
        },
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

  async clearErrorData(e) {

    // 清除错误签到数据
    let userSignInfos = setting.getData(e.group_id, '/user')
    if (userSignInfos) {
      let str = ''
      const userIds = Object.keys(userSignInfos)
      //todo 清除无效userId
      await userIds.map(async userId => {
        let userInfo = userSignInfos[userId]
        if (userInfo.roleName && !(userInfo.roleName in setting.roles)) {
          delete userInfo.roleName
          delete userInfo.date
          delete userInfo.roleImg
        }
        if (userInfo.history) {
          await Object.keys(userInfo.history).map(roleName => {
            if (!(roleName in setting.roles)) {
              str += `已清除${userId}:${roleName}的签到数据\n`
              delete userInfo.history[roleName]
            }
          })
        }
      })
      await setting.setData(e.group_id, userSignInfos, '/user')
      e.reply(str + '\n无效签到数据已清除')
    }


    e.reply('本群无效数据清除完成!')
  }

}
