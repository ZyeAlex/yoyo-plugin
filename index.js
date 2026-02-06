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



const app = fs.readdirSync('./plugins/yoyo-plugin/apps').filter(file => file.endsWith('.js'))
const other = fs.readdirSync('./plugins/yoyo-plugin/apps/others').filter(file => file.endsWith('.js'))

let ret = []
app.forEach((file) => {
  ret.push(import(`./apps/${file}`))
})
other.forEach((file) => {
  ret.push(import(`./apps/others/${file}`))
})
ret = await Promise.allSettled(ret)

logger.info('🍀🍀🍀🍀🍀🍀🍀🍀🍀\tyoyo-plugin载入中...\t🍀🍀🍀🍀🍀🍀🍀🍀🍀')
logger.info('\t仓库地址: https://gitee.com/yoyo-plugin/yoyo-plugin')
logger.info('\t插 件 群: https://qm.qq.com/q/Mk3jyhIqSm')
logger.info('\t插件群号: 991709221')
logger.info('🍀🍀🍀🍀🍀🍀🍀🍀🍀\tyoyo-plugin载入成功!\t🍀🍀🍀🍀🍀🍀🍀🍀🍀')

const files = [...app, ...other]
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
