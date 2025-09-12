import { execSync } from 'child_process'
import plugin from '../../../lib/plugins/plugin.js'
import { update } from '../../other/update.js'
import setting from '#setting'
import utils from '#utils'
import fs from 'fs'
let packageJson = JSON.parse(fs.readFileSync(setting.path + '/package.json', 'utf8'));
const name = packageJson.name || 'yoyo-plugin'
const version = packageJson.version || Version.version
export class Update extends plugin {
  constructor() {
    super({
      name: '[悠悠助手]更新',
      event: 'message',
      priority: 9999,
      rule: [
        {
          reg: `^(${setting.rulePrefix}|悠悠|yoyo)(强制)?更新$`,
          fnc: 'update_plugin',
          permission: 'master'
        },
        {
          reg: `^(${setting.rulePrefix}|悠悠|yoyo)迁移仓库$`,
          fnc: 'migrate',
          permission: 'master'
        },
        {
          reg: `${setting.rulePrefix}更新日志$`,

          fnc: 'update_log',
          permission: 'master'
        },
        {
          reg: `${setting.rulePrefix}?(删除|清除|清空|重置)(错误|无效|脏)数据$`,
          fnc: 'clearErrorData',
          permission: 'master'
        },
      ]
    })
  }

  async update_plugin() {
    let Update_Plugin = new update()
    Update_Plugin.e = this.e
    Update_Plugin.reply = this.reply

    if (Update_Plugin.getPlugin(name)) {
      if (this.e.msg.includes('强制')) {
        await execSync('git reset --hard origin/master', { cwd: `${process.cwd()}/plugins/${name}/` })
      }
      await Update_Plugin.runUpdate(name)
      if (Update_Plugin.isUp) {
        setTimeout(() => Update_Plugin.restart(), 2000)
      }
    }
    return true
  }
  async migrate() {
    await execSync('git remote set-url origin https://gitee.com/yoyo-plugin/yoyo-plugin', { cwd: `${process.cwd()}/plugins/${name}/` })
    this.reply('仓库地址已迁移')
  }

  async update_log() {
    let Update_Plugin = new update()
    Update_Plugin.e = this.e
    Update_Plugin.reply = this.reply

    if (Update_Plugin.getPlugin(name)) {
      this.e.reply(await Update_Plugin.getLog(name))
    }
    return true
  }

  // 清除错误签到数据
  async clearErrorData(e) {
    let userSignInfos = setting.getData(e.group_id, '/user')
    // 备份
    setting.setData(e.group_id + '-backup', userSignInfos, '/user')
    if (userSignInfos) {
      let str = ''
      const userIds = Object.keys(userSignInfos)
      //todo 清除无效userId
      userIds.forEach(userId => {
        let userInfo = userSignInfos[userId]
        // 兼容
        userInfo.heroName = userInfo.heroName || userInfo.roleName
        delete userInfo.roleName

        if (userInfo.heroName && !(userInfo.heroName in setting.heroIds)) {
          delete userInfo.heroName
          delete userInfo.date
          delete userInfo.heroImg
        }
        if (userInfo.history) {
          Object.keys(userInfo.history).forEach(heroName => {
            if (!(heroName in setting.heroIds)) {
              str += `已清除${userId}:${heroName}的签到数据\n`
              delete userInfo.history[heroName]
            }
          })
        }
      })
      setting.setData(e.group_id, userSignInfos, '/user')
      if (str) {
        if (str.length > 500) {
          // 取500，后面加省略号
          str = str.substring(0, 500) + '...'
        }
        e.reply(str + '\n无效签到数据已清除')
      }
    }

    // 等0.5秒
    await utils.sleep(500)

    e.reply('本群无效数据清除完成!')
  }

}
