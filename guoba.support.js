import lodash from 'lodash'
import setting from '#setting'
import path from 'path'
import fs from 'fs'
import YAML from 'yaml'

/**
 * 锅巴：Web 配置面板入口（详细配置见 /yoyo/）
 */
export function supportGuoba() {

  const iconPath = path.join(setting.path, '/resources/common/theme/logo_c.png')
  const pluginInfo = {
    name: 'yoyo-plugin',
    title: '蓝色星原旅谣',
    description: '蓝色星原旅谣Wiki、面板查询插件',
    isV3: true,
    showInMenu: true,
  }
  if (fs.existsSync(iconPath)) {
    pluginInfo.iconPath = iconPath
  }

  return {
    pluginInfo,
    configInfo: {
      schemas: [
        {
          component: 'Divider',
          label: '请使用「~悠悠登录」进行插件配置',
        },
      ],
      getConfigData() {
        return {
          config: {},
        }
      },
      setConfigData() {  },
    },
  }
}
