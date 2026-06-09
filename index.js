import fs from 'node:fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import game from './utils/game.js'

const pluginRoot = path.dirname(fileURLToPath(import.meta.url))

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
