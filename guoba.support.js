import lodash from 'lodash'
import setting from '#setting'
import path from 'path'
import fs from 'fs'
import YAML from 'yaml'

/**
 * 锅巴：Web 配置面板入口（详细配置见 /yoyo/）
 */

const PANEL_URL_FIELD = '__yoyoPanelUrl'

function getPanelUrl() {
  try {
    const files = [
      path.join(setting.yunzaiPath, 'config/config/server.yaml'),
      path.join(setting.yunzaiPath, 'config/default_config/server.yaml'),
    ]
    for (const file of files) {
      if (!fs.existsSync(file)) continue
      const data = YAML.parse(fs.readFileSync(file, 'utf8')) || {}
      const base = String(data.url || `http://127.0.0.1:${data.port || 2536}`).replace(/\/$/, '')
      return `${base}/yoyo/`
    }
  } catch (err) {
    logger?.debug?.(`[yoyo-plugin] 读取面板地址失败: ${err.message}`)
  }
  return 'http://127.0.0.1:2536/yoyo/'
}

export function supportGuoba() {
  const panelUrl = getPanelUrl()

  const iconPath = path.join(setting.path, '/resources/common/theme/logo_c.png')
  const pluginInfo = {
    name: 'yoyo-plugin',
    title: '蓝色星原旅谣',
    description: '配置请打开 Web 面板',
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
          component: 'SOFT_GROUP_BEGIN',
          label: '配置入口',
        },
        {
          field: `config.${PANEL_URL_FIELD}`,
          label: 'Web 配置面板',
          component: 'Input',
          componentProps: {
            readOnly: true,
          },
          bottomHelpMessage: `<a href="${panelUrl}" target="_blank" rel="noopener noreferrer">点击打开 YoAgent 配置中心</a> · 需先向 Bot 发送 #悠悠登录 获取带令牌链接`,
        },
      ],
      getConfigData() {
        return {
          config: {
            [PANEL_URL_FIELD]: panelUrl,
          },
        }
      },
      setConfigData(data, { Result }) {
        const incoming = {}
        for (const [keyPath, value] of Object.entries(data)) {
          lodash.set(incoming, keyPath, value)
        }
        const patch = { ...(incoming.config || {}) }
        delete patch[PANEL_URL_FIELD]

        if (!Object.keys(patch).length) {
          return Result.ok({}, '请打开 Web 配置面板修改并保存')
        }

        const next = lodash.mergeWith(lodash.cloneDeep(setting.config), patch, (objValue, srcValue) => {
          if (Array.isArray(srcValue)) return srcValue
        })
        setting.config = next
        setting.setData('config/config', next)
        return Result.ok({}, '保存成功~')
      },
    },
  }
}
