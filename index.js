import fs from 'node:fs'

if (!global.segment) {
  global.segment = (await import("oicq")).segment
}

if (!global.core) {
  try {
    global.core = (await import("oicq")).core
  } catch (err) { }
}

const files = fs.readdirSync('./plugins/yoyo-plugin/apps').filter(file => file.endsWith('.js'))
let ret = []
files.forEach((file) => {
  ret.push(import(`./apps/${file}`))
})
ret = await Promise.allSettled(ret)

logger.info('🍀🍀🍀🍀🍀🍀🍀🍀🍀\tyoyo-plugin载入中...\t🍀🍀🍀🍀🍀🍀🍀🍀🍀')
logger.info('🍀\t仓库地址: https://gitee.com/yoyo-plugin/yoyo-plugin\t🍀')
logger.info('🍀\t插 件 群: https://qm.qq.com/q/Mk3jyhIqSm\t\t🍀')
logger.info('🍀\t插件群号: 991709221\t\t\t\t\t🍀')
logger.info('🍀🍀🍀🍀🍀🍀🍀🍀🍀\tyoyo-plugin载入成功!\t🍀🍀🍀🍀🍀🍀🍀🍀🍀')

let apps = {}

for (let i in files) {
  let name = files[i].replace('.js', '')
  if (ret[i].status != 'fulfilled') {
    logger.error(`载入插件错误：${logger.red(name)}`)
    logger.error(ret[i].reason)
    continue
  }
  apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
}

export { apps }
