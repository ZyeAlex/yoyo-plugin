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
  return e.runtime.render('yoyo-plugin', path, renderData, {
    ...cfg,
    beforeRender({ data }) {
      let resPath = data.pluResPath
      return {
        ...data,
        resPath,
        layoutPath: setting.path + '/resources/common/',
        defaultLayout: setting.path + '/resources/common/layout.html',
        rulePrefix: setting.config.rulePrefix[0] || '$',
        sys: {
          // copyright: `Created By ${Version.name} & ${name}<span class="version">${version}</span>`,
          copyright: `<span class="version" style="font-size:24px">蓝色星原插件招美工共同开发，有意者进群联系：882552331</span>`,
          createdby: `Created By ${Version.name} & ${name}`
        },
        Math,
        JSON,
        quality: 100
      }
    }
  })
}
