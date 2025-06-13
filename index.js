import fs from 'node:fs'

if (!global.segment) {
  global.segment = (await import("oicq")).segment
}

if (!global.core) {
  try {
    global.core = (await import("oicq")).core
  } catch (err) {}
}

logger.info('—————————yoyo-plugin载入中...———————————')

const files = fs.readdirSync('./plugins/yoyo-plugin/apps').filter(file => file.endsWith('.js'))
let ret = []
files.forEach((file) => {
  ret.push(import(`./apps/${file}`))
})
ret = await Promise.allSettled(ret)

logger.info('仓库地址 https://github.com/ZyeAlex/yoyo-plugin')
logger.info('Created By 叶子🍃')
logger.info('插件群号: 882552331')
logger.info('—————————yoyo-plugin载入成功!———————————')

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
