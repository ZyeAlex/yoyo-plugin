import setting from './setting.js'
import Version from './version.js'
import fs from 'fs'
// 读取package

export default function render(e, path, renderData = {}, cfg = {}) {
  if (!e.runtime) {
    console.log('未找到e.runtime，请升级至最新版Yunzai')
  }
  let packageJson = JSON.parse(fs.readFileSync(setting.path + '/package.json', 'utf8'));
  const name = packageJson.name || 'yoyo-plugin'
  const version = packageJson.version || Version.version

  // 遍历 setting.path + '/resources/common' 下的html, 保存为 { name:'path/name.html' }
  let commonHtml = {}
  fs.readdirSync(setting.path + '/resources/common').forEach(file => {
    if (file.endsWith('.html')) {
      commonHtml[file.replace('.html', '')] = setting.path + '/resources/common/' + file
    }
  })

  return e.runtime.render('yoyo-plugin', path, renderData, {
    ...cfg,
    beforeRender({ data }) {
      return {
        ...data,
        ...commonHtml,
        pluginPath: setting.path,
        rulePrefix: setting.config.rulePrefix[0] || '$',
        sys: {
          copyright: `Created By ${Version.name} & ${name}<span class="version">${version}</span> (插件群 991709221)`,
          createdby: `Created By ${Version.name} & ${name}`
        },
        Math,
        JSON,
        quality: 100
      }
    }
  })
}
