import fs from 'node:fs'
import path from 'path'
if (!global.segment) {
  global.segment = (await import("oicq")).segment
}

if (!global.core) {
  try {
    global.core = (await import("oicq")).core
  } catch (err) { }
}




// 递归读取所有 .js 文件
function readFiles(dir) {
  let results = []
  const files = fs.readdirSync(dir, { withFileTypes: true })

  files.forEach((file) => {
    const fullPath = path.join(dir, file.name)
    if (file.isDirectory()) {
      // 如果是文件夹，递归进去
      results = results.concat(readFiles(fullPath))
    } else if (file.name.endsWith('.js')) {
      // 如果是 js 文件，添加到结果
      results.push(fullPath)
    }
  })

  return results
}

// 读取所有 js（包括子文件夹）
const files = readFiles(process.cwd().replace(/\\/g, '/')+ '/plugins/yoyo-plugin/apps')

let ret = []
files.forEach((file) => {
  ret.push(import(file))
})

ret = await Promise.allSettled(ret)

logger.info('🍀🍀🍀🍀🍀🍀🍀🍀🍀\tyoyo-plugin载入中...\t🍀🍀🍀🍀🍀🍀🍀🍀🍀')
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
  const moduleExports = ret[i].value
  const exportKeys = Object.keys(moduleExports)
  exportKeys.forEach(exportName => {
    apps[exportName] = moduleExports[exportName]
  });
}

export { apps }
