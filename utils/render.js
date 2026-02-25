import setting from './setting.js'
import fs from 'fs'
import lodash from 'lodash'
import path from 'path'
// 读取package

export default async function render(e, p, renderData = {}, cfg = {}) {
  if (!e.runtime) {
    console.log('未找到e.runtime，请升级至最新版Yunzai')
  }
  let { name, title, group, version } = JSON.parse(fs.readFileSync(setting.path + '/package.json', 'utf8'));

  // 遍历 setting.path + '/resources/common' 下的html, 保存为 { name:'path/name.html' }
  let commonHtml = {}
  fs.readdirSync(setting.path + '/resources/common').forEach(file => {
    if (file.endsWith('.html')) {
      commonHtml[file.replace('.html', '')] = setting.path + '/resources/common/' + file
    }
  })
  // 背景图片
  let bgImg = lodash.sample(Object.values(setting.pets))?.kiboBoxCardIcon?.[2]



  if (bgImg && fs.existsSync(path.join(setting.path, '/resources/UI', bgImg))) {
    bgImg = '/UI/' + bgImg
  } else {
    bgImg = '/common/pet/background.png'
  }
  // copyright
  let copyright = `${title}  <span class="version">${version}</span> | 插件群：<span class="version">${group}</span>`
  if (cfg.origin) copyright += `| 数据源 <span class="version">${cfg.origin}</span> `
  return e.runtime.render('yoyo-plugin', p, renderData, {
    ...cfg,
    beforeRender({ data }) {
      return {
        ...data,
        ...commonHtml,
        pluginPath: setting.path,
        layout: setting.path + '/resources/common/layout.html',
        bgImg,
        rulePrefix: setting.config.rulePrefix[0] || '$',
        sys: { name, title, copyright },
        Math,
        JSON,
        quality: 100
      }
    }
  })
}


// 保存原图
export async function saveRender(e, p, url, renderData = {}, ...args) {
  let msgRes = await e.reply([await render(e, p, renderData, { e, retType: 'base64' })], ...args)
  if (msgRes) {
    // 如果消息发送成功，就将message_id和图片路径存起来，3小时过期
    const message_id = [e.message_id]
    if (Array.isArray(msgRes.message_id)) {
      message_id.push(...msgRes.message_id)
    } else if (msgRes.message_id) {
      message_id.push(msgRes.message_id)
    }
    for (const i of message_id) {
      await redis.set(`yoyo:original-picture:${i}`, url, { EX: 3600 * 3 })
    }
  }
}