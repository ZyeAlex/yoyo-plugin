import setting from './setting.js'
import Version from './version.js'
import fs from 'fs'
import lodash from 'lodash'
// 读取package

export default async function render(e, path, renderData = {}, cfg = {}) {
  if (!e.runtime) {
    console.log('未找到e.runtime，请升级至最新版Yunzai')
  }
  let packageJson = JSON.parse(fs.readFileSync(setting.path + '/package.json', 'utf8'));
  const name = packageJson.name
  const nameCH = packageJson.nameCH
  const version = packageJson.version || Version.version

  // 遍历 setting.path + '/resources/common' 下的html, 保存为 { name:'path/name.html' }
  let commonHtml = {}
  fs.readdirSync(setting.path + '/resources/common').forEach(file => {
    if (file.endsWith('.html')) {
      commonHtml[file.replace('.html', '')] = setting.path + '/resources/common/' + file
    }
  })
  let bgImg = lodash.sample(Object.values(setting.pets))?.kiboBoxCardIcon?.[2] || 'tex_pet_kibo_card_background_500001.png'
  return e.runtime.render('yoyo-plugin', path, renderData, {
    ...cfg,
    beforeRender({ data }) {
      return {
        ...data,
        ...commonHtml,
        pluginPath: setting.path,
        layout: setting.path + '/resources/common/layout.html',
        bgImg,
        rulePrefix: setting.config.rulePrefix[0] || '$',
        sys: {
          name, nameCH,
          copyright: `${nameCH}  <span class="version">${version}</span> `,

        },
        Math,
        JSON,
        quality: 100
      }
    }
  })
}


// 保存原图
export async function saveRender(e, path, renderData, originalPicture) {
  let msgRes = await e.reply([await render(e, path, renderData, { e, retType: 'base64' })])
  if (msgRes) {
    // 如果消息发送成功，就将message_id和图片路径存起来，3小时过期
    const message_id = [e.message_id]
    if (Array.isArray(msgRes.message_id)) {
      message_id.push(...msgRes.message_id)
    } else if (msgRes.message_id) {
      message_id.push(msgRes.message_id)
    }
    for (const i of message_id) {
      await redis.set(`yoyo-plugin:original-picture:${i}`, originalPicture, { EX: 3600 * 3 })
    }

  }
}