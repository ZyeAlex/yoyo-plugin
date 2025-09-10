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
          copyright: `插件: <span class="version">${nameCH} ${version}</span> 插件群: <span class="version">991709221</span>`,

        },
        Math,
        JSON,
        quality: 100
      }
    }
  })
}
