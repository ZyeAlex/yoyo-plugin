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
      return replyImageWithOriginal(e, cachedPath)
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
  if (p === 'sign/index') {
    bgImg = ''
  } else if (cacheScope) {
    bgImg = '/common/pet/background.png'
  } else {
    const pet = lodash.sample(game.getPublicPets())
    const cardBg = pet?.id ? `tex_pet_kibo_card_background_${pet.id}.png` : null
    if (cardBg && fs.existsSync(path.join(setting.path, 'resources/UI', cardBg))) {
      bgImg = '/UI/' + cardBg
    } else {
      bgImg = '/common/pet/background.png'
    }
  }

  let copyrightParts = [
    `${title} <span class="copyright-value">${version}</span>`,
    `插件群 <span class="copyright-value">${pluginGroup}</span>`,
  ]
  if (cfg.origin) copyrightParts.push(`数据源 <span class="copyright-value">${cfg.origin}</span>`)
  const copyright = copyrightParts.join(' <span class="copyright-sep">|</span> ')

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
    return replyImageWithOriginal(e, savedPath)
  }

  return result
}

const ORIGINAL_PICTURE_TTL = 3600 * 3

export function extractReplyMessageIds(msgRes) {
  const ids = new Set()
  const push = (id) => {
    if (id == null || id === '') return
    if (Array.isArray(id)) id.forEach(push)
    else ids.add(String(id))
  }
  push(msgRes?.message_id)
  push(msgRes?.data?.message_id)
  if (Array.isArray(msgRes?.data)) {
    msgRes.data.forEach(item => push(item?.message_id))
  }
  return [...ids]
}

export async function registerOriginalPicture(msgRes, originalPath) {
  if (!originalPath || !msgRes) return
  for (const id of extractReplyMessageIds(msgRes)) {
    await redis.set(`yoyo:original-picture:${id}`, originalPath, { EX: ORIGINAL_PICTURE_TTL })
  }
}

async function replyImageWithOriginal(e, imgPath) {
  const msgRes = await e.reply(segment.image(imgPath))
  await registerOriginalPicture(msgRes, imgPath)
  return msgRes
}

// 保存原图（签到等场景：渲染图 + 关联更高清本地图）
export async function saveRender(e, p, url, renderData = {}, ...args) {
  const rendered = await render(e, p, renderData, { retType: 'base64' })
  const msgRes = await e.reply([rendered], ...args)
  await registerOriginalPicture(msgRes, url)
}

export { CACHE_SCOPE, buildAtlasKey, clearRenderCache, clearPanelCache, buildPanelKey } from './renderCache.js'

const style = (style = {}) => {
  let styleStr = ''
  for (let [key, value] of Object.entries(style || {})) {
    styleStr += `${key}:${value};`
  }
  return styleStr
}
