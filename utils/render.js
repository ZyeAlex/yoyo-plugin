import setting from './setting.js'
import Version from './version.js'

export default function render(e, path, renderData = {}, cfg = {}) {
  if (!e.runtime) {
    console.log('未找到e.runtime，请升级至最新版Yunzai')
  }
  const layoutPath =
    process.cwd() + '/plugins/yoyo-plugin/resources/common/'
  const name = setting.config.name || 'yoyo-plugin'
  const version = setting.config.version || Version.version
  return e.runtime.render('yoyo-plugin', path, renderData, {
    ...cfg,
    beforeRender({ data }) {
      let resPath = data.pluResPath
      return {
        ...data,
        resPath,
        layoutPath,
        defaultLayout: layoutPath + 'layout.html',
        rulePrefix: setting.config.rulePrefix[0] || '$',
        sys: {
          copyright: `Created By ${Version.name} & ${name}<span class="version">${version}</span>`,
          createdby: `Created By ${Version.name} & ${name}`
        },
        Math,
        JSON,
        quality: 100
      }
    }
  })
}
