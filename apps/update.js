import { execSync } from 'child_process'
import { update } from '../../other/update.js'
import setting from '#setting'
import game from '#game'
import utils from '#utils'
import fs from 'fs'
import path from 'path'
import plugin from '#plugin'
import { getChatPort } from '../api/chat/schema.js'
import { ensureUv, resolveUvBin } from '../utils/uv.js'
import {
  isChatServerRunning,
  restartChatServer,
  stopChatServer,
  startChatServer,
} from '../utils/chat-server.js'

let packageJson = JSON.parse(fs.readFileSync(setting.path + '/package.json', 'utf8'))
const name = packageJson.name || 'yoyo-plugin'
const CHAT_REPO = 'https://gitee.com/yoyo-plugin/yoyo-sauce.git'
const UV_PYTHON_MIRROR = 'https://mirrors.ustc.edu.cn/github-release/astral-sh/python-build-standalone/'

function chatUvEnv() {
  return { ...process.env, UV_PYTHON_INSTALL_MIRROR: UV_PYTHON_MIRROR }
}

function execErrorMessage(err) {
  const parts = [err.message, err.stderr?.toString(), err.stdout?.toString()].filter(Boolean)
  return parts.join('\n').trim()
}

function chatServerDir() {
  return path.join(setting.path, 'server')
}

function chatVenvUvicorn() {
  const binName = process.platform === 'win32' ? 'uvicorn.exe' : 'uvicorn'
  const bin = path.join(chatServerDir(), '.venv', 'bin', binName)
  return fs.existsSync(bin) ? bin : null
}

function installChatPlugin() {
  const dest = path.join(setting.path, 'apps/chat.js')
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(path.join(setting.path, 'api/chat/plugin.js'), dest)
}

function ensureChatServerRepo() {
  const dir = chatServerDir()
  if (fs.existsSync(dir)) {
    // 本地已有 Chat Brain 源码（含 src/main.py）则优先保留，仅尝试 pull
    if (fs.existsSync(path.join(dir, 'src', 'main.py'))) {
      if (fs.existsSync(path.join(dir, '.git'))) {
        try {
          execSync('git pull', { cwd: dir, stdio: 'pipe', timeout: 120000 })
        } catch {
          // 离线或冲突时继续用本地
        }
      }
      return
    }
    if (!fs.existsSync(path.join(dir, '.git'))) {
      throw new Error('server/ 已存在但不是可用的 Chat Brain，请先手动清理')
    }
    try {
      execSync('git pull', { cwd: dir, stdio: 'pipe', timeout: 120000 })
    } catch {
      // ignore
    }
    return
  }
  execSync(`git clone ${CHAT_REPO} "${dir}"`, { stdio: 'pipe', timeout: 300000 })
}

export const Update = plugin({
  name: '[悠悠助手]更新',
  event: 'message',
  priority: 100,
  rule: [
    {
      reg: `^(#|悠悠|yoyo)(强制)?更新$`,
      fnc: update_plugin,
      permission: 'master',
    },
    {
      reg: new RegExp(`^(?:${setting.rulePrefix}|悠悠|yoyo)切?换(github|gitee)?源(github|gitee)?$`, 'i'),
      fnc: migrate,
      permission: 'master',
    },
    {
      reg: `^#更新日志$`,
      fnc: update_log,
      permission: 'master',
    },
    {
      reg: `^#?(删除|清除|清空|重置|清理)(错误|无效|脏)数据$`,
      fnc: clearErrorData,
      permission: 'master',
    },
    {
      reg: `^#安装悠悠$`,
      fnc: installChat,
      permission: 'master',
    },
    {
      reg: `^#卸载悠悠$`,
      fnc: uninstallChat,
      permission: 'master',
    },
    {
      reg: `^#启动悠悠$`,
      fnc: startChat,
      permission: 'master',
    },
    {
      reg: `^#停止悠悠$`,
      fnc: stopChat,
      permission: 'master',
    },
    {
      reg: `^#重启悠悠$`,
      fnc: restartChat,
      permission: 'master',
    },
  ],
})

async function update_plugin(e) {
  let Update_Plugin = new update()
  Update_Plugin.e = e
  Update_Plugin.reply = e.reply

  if (Update_Plugin.getPlugin(name)) {
    if (e.msg.includes('强制')) {
      execSync('git stash save "强制更新前暂存本地修改" --include-untracked', {
        cwd: setting.path,
        stdio: 'pipe',
      })
      execSync('git fetch origin master', { cwd: setting.path, stdio: 'pipe' })
      execSync('git reset --hard origin/master', { cwd: setting.path, stdio: 'pipe' })
      execSync('git stash pop', { cwd: setting.path, stdio: 'pipe' })
    }
    await Update_Plugin.runUpdate(name)
    if (Update_Plugin.isUp) {
      setTimeout(() => Update_Plugin.restart(), 2000)
    }
  }
  return true
}

async function migrate(e, originName = '') {
  let origin = (await execSync('git remote -v get-url origin', { cwd: setting.path })).toString().trim()
  if (/gitee/i.test(origin) && originName.toLowerCase() != 'gitee') {
    await execSync('git remote set-url origin https://github.com/ZyeAlex/yoyo-plugin', {
      cwd: setting.path,
    })
    e.reply('[yoyo-plugin]已切换至Github开发源')
    return
  }
  if (/github/i.test(origin) && originName.toLowerCase() != 'github') {
    await execSync('git remote set-url origin https://gitee.com/yoyo-plugin/yoyo-plugin', {
      cwd: setting.path,
    })
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

async function clearErrorData(e) {
  let forward = []
  let userList = await e.group.getMemberList()
  let userSignInfos = setting.getData('data/group/' + e.group_id + '/others', {}, 'yunzai')
  setting.setData('data/group/' + e.group_id + '/others-b', userSignInfos, 'yunzai')

  if (userSignInfos) {
    let str = ''
    str += '清除退群用户签到数据：\n'

    let leave = Object.keys(userSignInfos).filter((id) => userList.every((userId) => userId != id))
    str += `本次共有${leave.length}位签到成员退群\n(┬┬﹏┬┬)\n\n`
    leave.forEach((id) => {
      str += `已清除${id}的签到数据\n`
      delete userSignInfos[id]
    })
    if (leave) {
      forward.push(str.length > 1000 ? str.substring(0, 1000) + '...' : str)
    }

    if (Object.keys(game.heros).length) {
      let num = 0
      str = '清除无效签到数据：'

      Object.keys(userSignInfos).forEach((userId) => {
        let userInfo = userSignInfos[userId]

        if (userInfo.heroId && !(userInfo.heroId in game.heros)) {
          delete userInfo.heroId
          delete userInfo.date
        }
        if (userInfo.history) {
          Object.keys(userInfo.history).forEach((heroName) => {
            if (!(heroName in game.heroIds)) {
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
  setting.setData('data/group/' + e.group_id + '/others', userSignInfos, 'yunzai')
  forward.push('无效数据已全部清除完毕！')
  e.reply(utils.makeForwardMsg(e, forward))
}

async function installChat(e) {
  try {
    await e.reply('[悠悠] 开始安装 Chat Brain，请稍候…')
    const hadUv = !!resolveUvBin(setting.path)
    const uvBin = await ensureUv(setting.path, true)
    await e.reply('[悠悠] 正在准备 server/ …')
    ensureChatServerRepo()
    if (!chatVenvUvicorn()) {
      await e.reply('[悠悠] 正在安装 Python 依赖（首次较慢）…')
      execSync(`"${uvBin}" sync`, {
        cwd: chatServerDir(),
        stdio: 'pipe',
        env: chatUvEnv(),
        timeout: 600000,
      })
    }
    await e.reply('[悠悠] 正在启动服务…')
    await startChatServer(setting.path, setting.config, uvBin)
    installChatPlugin()
    const port = getChatPort(setting.config)
    const uvTip = hadUv ? '' : '，已自动安装 uv'
    await e.reply(
      [
        `已安装悠悠，Chat Brain 已启动（端口 ${port}${uvTip}），即将重启云崽`,
        '',
        '还需手动配置：',
        '1. chatEnabled: true',
        '2. chatInclude 填入群号',
        '3. chatLlmApiKey 等模型配置（面板可配）',
      ].join('\n'),
    )
    const Update_Plugin = new update()
    Update_Plugin.e = e
    Update_Plugin.reply = e.reply
    setTimeout(() => Update_Plugin.restart(), 2000)
  } catch (err) {
    await e.reply(`[悠悠] 安装失败：${execErrorMessage(err)}`)
  }
  return true
}

async function uninstallChat(e) {
  const dest = path.join(setting.path, 'apps/chat.js')
  if (!fs.existsSync(dest) && !fs.existsSync(chatServerDir())) {
    await e.reply('悠悠未安装')
    return true
  }
  stopChatServer(setting.path, setting.config)
  if (fs.existsSync(dest)) fs.unlinkSync(dest)
  await e.reply('已卸载悠悠，Chat Brain 已停止，即将重启云崽')
  const Update_Plugin = new update()
  Update_Plugin.e = e
  Update_Plugin.reply = e.reply
  setTimeout(() => Update_Plugin.restart(), 2000)
  return true
}

async function startChat(e) {
  try {
    const uvBin = await ensureUv(setting.path, false)
    if (isChatServerRunning(setting.config)) {
      await e.reply(`[悠悠] Chat Brain 已在运行（端口 ${getChatPort(setting.config)}）`)
      return true
    }
    await startChatServer(setting.path, setting.config, uvBin)
    await e.reply(`[悠悠] Chat Brain 已启动（端口 ${getChatPort(setting.config)}）`)
  } catch (err) {
    await e.reply(`[悠悠] 启动失败：${execErrorMessage(err)}`)
  }
  return true
}

async function stopChat(e) {
  if (!isChatServerRunning(setting.config)) {
    await e.reply('[悠悠] Chat Brain 未在运行')
    return true
  }
  stopChatServer(setting.path, setting.config)
  await e.reply('[悠悠] Chat Brain 已停止')
  return true
}

async function restartChat(e) {
  try {
    const uvBin = await ensureUv(setting.path, false)
    const port = getChatPort(setting.config)
    await restartChatServer(setting.path, setting.config, uvBin)
    await e.reply(`[悠悠] Chat Brain 已重启（端口 ${port}）`)
  } catch (err) {
    await e.reply(`[悠悠] 重启失败：${execErrorMessage(err)}`)
  }
  return true
}
