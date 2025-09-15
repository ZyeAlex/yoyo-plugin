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
      reg: `${setting.rulePrefix}?(删除|清除|清空|重置|清理)(错误|无效|脏)数据$`,
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
async function migrate(e, reg) {
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
  let forward = []
  let userList = await e.group.getMemberList()
  let userSignInfos = setting.getData('data/user/'+ e.group_id)
  setting.setData( 'data/user/'+ e.group_id + '-backup', userSignInfos)  // 备份

  if (userSignInfos) {
    let str = ''
    //清除无效userId
    str += '清除退群用户签到数据：\n'

    let leave = Object.keys(userSignInfos).filter(id => userList.every(userId => userId != id))
    str += `本次共有${leave.length}位签到成员退群\n(┬┬﹏┬┬)\n\n`
    leave.forEach(id => {
      str += `已清除${id}的签到数据\n`
      delete userSignInfos[id]
    })
    if (leave) {
      forward.push(str.length > 1000 ? str.substring(0, 1000) + '...' : str)
    }


    if (Object.keys(setting.heros).length) {
      let num = 0
      str = '清除无效签到数据：'

      Object.keys(userSignInfos).forEach(userId => {
        let userInfo = userSignInfos[userId]

        if (userInfo.heroId && !(userInfo.heroId in setting.heros)) {
          delete userInfo.heroId
          delete userInfo.date
        }
        if (userInfo.history) {
          Object.keys(userInfo.history).forEach(heroName => {
            if (!(heroName in setting.heroIds)) {
              str += `已清除${userId}:${heroName}的签到数据\n`
              num++
              delete userInfo.history[heroName]
            }
          })
        }
      })
      if (num) {
        forward.push(str.length > 1000 ? str.substring(0, 1000) + '...' : str)
      }

    }

  }


  setting.setData('data/user/'+ e.group_id, userSignInfos, )

  forward.push('无效数据已全部清除完毕！')

  e.reply(utils.makeForwardMsg(e, forward))
}
