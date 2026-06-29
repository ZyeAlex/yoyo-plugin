import fs from 'node:fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import game from './utils/game.js'

const pluginRoot = path.dirname(fileURLToPath(import.meta.url))

/** 开发时自动同步 api/agent/agent.js → apps/agent.js（#安装悠悠 亦会拷贝） */
function syncAgentPlugin() {
  try {
    const src = path.join(pluginRoot, 'api/agent/agent.js')
    const dest = path.join(pluginRoot, 'apps/agent.js')
    if (!fs.existsSync(src)) return
    if (!fs.existsSync(dest) || fs.statSync(src).mtimeMs > fs.statSync(dest).mtimeMs) {
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(src, dest)
      logger.info('[yoyo-plugin] 已同步 api/agent/agent.js → apps/agent.js')
    }
  } catch (err) {
    logger.debug(`[yoyo-plugin] agent.js 同步跳过: ${err.message}`)
  }
}
syncAgentPlugin()

if (!global.segment) {
  global.segment = (await import("oicq")).segment
}

if (!global.core) {
  try {
    global.core = (await import("oicq")).core
  } catch (err) { }
}

function readFiles(dir) {
  let results = []
  const files = fs.readdirSync(dir, { withFileTypes: true })
  files.forEach((file) => {
    const fullPath = path.join(dir, file.name)
    if (file.isDirectory()) {
      results = results.concat(readFiles(fullPath))
    } else if (file.name.endsWith('.js')) {
      results.push(fullPath)
    }
  })
  return results
}

const appsDir = path.join(pluginRoot, 'apps')
const files = readFiles(appsDir)

let ret = await Promise.allSettled(files.map(file => import(pathToFileURL(file).href)))

logger.info('🍀🍀🍀🍀🍀🍀🍀🍀🍀\tyoyo-plugin载入中...\t🍀🍀🍀🍀🍀🍀🍀🍀🍀')
await game.ready
logger.info('\t仓库地址: https://gitee.com/yoyo-plugin/yoyo-plugin')
logger.info('\t插 件 群: https://qm.qq.com/q/Mk3jyhIqSm')
logger.info('\t插件群号: 991709221')
logger.info('🍀🍀🍀🍀🍀🍀🍀🍀🍀\tyoyo-plugin载入成功!\t🍀🍀🍀🍀🍀🍀🍀🍀🍀')

let apps = {}
for (let i in files) {
  if (ret[i].status != 'fulfilled') {
    logger.error(`载入插件错误：${logger.red(files[i])}`)
    logger.error(ret[i].reason)
    continue
  }
  Object.entries(ret[i].value).forEach(([exportName, pluginClass]) => {
    apps[exportName] = pluginClass
  })
}

export { apps }
