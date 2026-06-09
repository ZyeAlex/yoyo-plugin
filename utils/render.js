import setting from './setting.js'
import game from './game.js'
import fs from 'fs'
import lodash from 'lodash'
import path from 'path'
import {
  CACHE_SCOPE,
  buildAtlasKey,
  getCachedPath,
  getImagePath,
  saveCachedImage,
} from './renderCache.js'
import { enrichSkills, enrichPetAtlasSkills } from '../api/wiki/parser.js'

export default async function render(e, p, renderData = {}, cfg = {}) {
  if (!e.runtime) {
    console.log('未找到e.runtime，请升级至最新版Yunzai')
  }

  const cacheScope = cfg.cache === 'atlas' ? CACHE_SCOPE.ATLAS
    : cfg.cache === 'panel' ? CACHE_SCOPE.PANEL
      : null
  const cacheKey = cacheScope
    ? (cfg.cacheKey || (cacheScope === CACHE_SCOPE.ATLAS ? buildAtlasKey(p, renderData) : null))
    : null

  if (cacheScope && cacheKey) {
    const cachedPath = getCachedPath(cacheScope, cacheKey)
    if (cachedPath) {
      return e.reply(segment.image(cachedPath))
    }
  }

  let { name, title, pluginGroup, version } = JSON.parse(fs.readFileSync(setting.path + '/package.json', 'utf8'))

  let commonHtml = {}
  fs.readdirSync(setting.path + '/resources/common').forEach(file => {
    if (file.endsWith('.html')) {
      commonHtml[file.replace('.html', '')] = setting.path + '/resources/common/' + file
    }
  })

  let bgImg
  if (cacheScope) {
    bgImg = '/common/pet/background.png'
  } else {
    const pet = lodash.sample(Object.values(game.pets))
    const cardBg = pet?.id ? `tex_pet_kibo_card_background_${pet.id}.png` : null
    if (cardBg && fs.existsSync(path.join(setting.path, 'resources/UI', cardBg))) {
      bgImg = '/UI/' + cardBg
    } else {
      bgImg = '/common/pet/background.png'
    }
  }

  let copyright = `${title} <span class="version">${version}</span> | 插件群 <span class="version">${pluginGroup}</span>`
  if (cfg.origin) copyright += `| 数据源 <span class="version">${cfg.origin}</span> `

  const useCacheWrite = cacheScope && cacheKey && !cfg.retType
  let cacheTargetPath = null
  if (useCacheWrite) {
    cacheTargetPath = getImagePath(cacheScope, cacheKey)
    const dir = path.dirname(cacheTargetPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }
  const renderCfg = {
    ...cfg,
    retType: useCacheWrite ? 'base64' : cfg.retType,
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
        style,
        quality: 100,
        ...(cacheTargetPath ? { path: cacheTargetPath } : {}),
      }
    }
  }

  if (renderData.skills?.length) {
    renderData = { ...renderData, skills: enrichSkills(renderData.skills) }
  }
  if (p === 'pet/atlas' || p.startsWith('pet/')) {
    renderData = enrichPetAtlasSkills(renderData)
  }

  const result = await e.runtime.render('yoyo-plugin', p, renderData, renderCfg)

  if (useCacheWrite && result) {
    let savedPath = cacheTargetPath
    if (!savedPath || !fs.existsSync(savedPath)) {
      savedPath = await saveCachedImage(cacheScope, cacheKey, result)
    } else {
      logger.mark(`[yoyo-plugin][renderCache] saved ${cacheScope}/${cacheKey}`)
    }
    return e.reply(segment.image(savedPath))
  }

  return result
}


// 保存原图
export async function saveRender(e, p, url, renderData = {}, ...args) {
  let msgRes = await e.reply([await render(e, p, renderData, { e, retType: 'base64' })], ...args)
  if (msgRes) {
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

export { CACHE_SCOPE, buildAtlasKey, clearRenderCache, clearPanelCache, buildPanelKey } from './renderCache.js'

const style = (style = {}) => {
  let styleStr = ''
  for (let [key, value] of Object.entries(style || {})) {
    styleStr += `${key}:${value};`
  }
  return styleStr
}
