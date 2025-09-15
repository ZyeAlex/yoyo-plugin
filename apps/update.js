import { execSync } from 'child_process'
import { update } from '../../other/update.js'
import setting from '#setting'
import utils from '#utils'
import fs from 'fs'
import plugin from '#plugin'

let packageJson = JSON.parse(fs.readFileSync(setting.path + '/package.json', 'utf8'));
const name = packageJson.name || 'yoyo-plugin'
const version = packageJson.version || Version.version

export const Update = plugin({
  name: '[悠悠助手]更新',
  event: 'message',
  priority: 9999,
  rule: [
    {
      reg: `^(${setting.rulePrefix}|悠悠|yoyo)(强制)?更新$`,
      fnc: update_plugin,
      permission: 'master'
    },
    {
      reg: new RegExp(`^(?:${setting.rulePrefix}|悠悠|yoyo)切?换(github|gitee)?源(github|gitee)?$`, 'i'),
      fnc: migrate,
      permission: 'master'
    },
    {
      reg: `${setting.rulePrefix}更新日志$`,

      fnc: update_log,
      permission: 'master'
    },
    {
      reg: `${setting.rulePrefix}?(删除|清除|清空|重置)(错误|无效|脏)数据$`,
      fnc: clearErrorData,
      permission: 'master'
    },
  ]
})


async function update_plugin(e) {
  let Update_Plugin = new update()
  Update_Plugin.e = e
  Update_Plugin.reply = e.reply

  if (Update_Plugin.getPlugin(name)) {
    await execSync('git add .', { cwd: setting.path })
    await execSync('git commit -mchange', { cwd: setting.path })
    if (e.msg.includes('强制')) {
      await execSync('git reset --hard origin/master', { cwd: setting.path })
    }
    await Update_Plugin.runUpdate(name)
    if (Update_Plugin.isUp) {
      setTimeout(() => Update_Plugin.restart(), 2000)
    }
  }
  return true
}
async function migrate(e) {
  let reg = new RegExp(`^(?:${setting.rulePrefix}|悠悠|yoyo)切?换(github|gitee)?源$`, 'i')
  let originName = e.msg.match(reg)[1] || ''
  let origin = (await execSync('git remote -v get-url origin', { cwd: setting.path })).toString().trim()
  if (/gitee/i.test(origin) && originName.toLowerCase() != 'gitee') {
    await execSync('git remote set-url origin https://github.com/ZyeAlex/yoyo-plugin', { cwd: setting.path })
    e.reply('[yoyo-plugin]已切换至Github开发源')
    return
  }
  if (/github/i.test(origin) && originName.toLowerCase() != 'github') {
    await execSync('git remote set-url origin https://gitee.com/yoyo-plugin/yoyo-plugin', { cwd: setting.path })
    e.reply('[yoyo-plugin]已切换至Gitee用户源')
    return
  }
  e.reply('[yoyo-plugin]插件已在当前源')
}

async function update_log(e) {
  let Update_Plugin = new update()
  Update_Plugin.e = e
  Update_Plugin.reply = e.reply

  if (Update_Plugin.getPlugin(name)) {
    e.reply(await Update_Plugin.getLog(name))
  }
  return true
}

// 清除错误签到数据
async function clearErrorData(e) {
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
