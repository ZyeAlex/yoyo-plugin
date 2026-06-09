import fs from 'fs'
import path from 'path'
import setting from './setting.js'

export const CACHE_SCOPE = {
  ATLAS: 'atlas',
  PANEL: 'panel',
}

const DATA_TYPE_DIR = {
  Hero: 'hero',
  Kibo: 'pet',
  Spirit: 'spirit',
  Item: 'item',
  Accessory: 'accessory',
}

const CACHE_ROOT = path.join(setting.path, 'data/cache/render')
const IMAGE_EXT = '.jpg'

function scopeDir(scope) {
  return path.join(CACHE_ROOT, scope)
}

function imagePath(scope, key) {
  return path.join(scopeDir(scope), `${key}${IMAGE_EXT}`)
}

export function getImagePath(scope, key) {
  return imagePath(scope, key)
}

/** Yunzai retType:base64 返回 segment.image(buffer)，需还原为 Buffer */
export function normalizeImageBuffer(input) {
  if (Buffer.isBuffer(input)) return input
  if (input?.type === 'image' && input.file != null) {
    const { file } = input
    if (Buffer.isBuffer(file)) return file
    if (typeof file === 'string') {
      if (fs.existsSync(file)) return fs.readFileSync(file)
      const base64 = file.replace(/^base64:\/\//, '')
      if (base64 !== file) return Buffer.from(base64, 'base64')
    }
  }
  throw new TypeError('[yoyo-plugin][renderCache] invalid image data')
}

/**
 * 由模板路径与渲染数据生成 atlas 缓存 key（不含 scope 前缀）
 */
export function buildAtlasKey(tpl, renderData = {}) {
  const parts = tpl.replace(/\.html$/, '').split('/').filter(Boolean)
  const [category, page] = parts

  if (page === 'list') {
    return `${category}/list`
  }

  const id = renderData.id
  if (!id) return `${category}/${page}`

  if (category === 'hero' && page === 'atlas') {
    const types = [...(renderData.type || ['skill', 'talent'])].sort().join('-') || 'default'
    const introFlag = renderData.showIntro ? 'intro' : 'no-intro'
    return `hero/${id}/${types}-${introFlag}`
  }

  return `${category}/${id}`
}

/**
 * 预留：角色面板缓存 key
 * @param {string} uid
 * @param {string} tpl
 */
export function buildPanelKey(uid, tpl) {
  const page = tpl.replace(/\.html$/, '').split('/').filter(Boolean).pop() || 'panel'
  return `${uid}/${page}`
}

export function getCachedPath(scope, key) {
  const file = imagePath(scope, key)
  if (fs.existsSync(file)) {
    logger.mark(`[yoyo-plugin][renderCache] hit ${scope}/${key}`)
    return file
  }
  return null
}

export async function saveCachedImage(scope, key, imageData) {
  const file = imagePath(scope, key)
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, normalizeImageBuffer(imageData))
  logger.mark(`[yoyo-plugin][renderCache] saved ${scope}/${key}`)
  return file
}

/**
 * 清除图鉴渲染缓存
 * @param {'Hero'|'Kibo'|'Spirit'|'Item'|'Accessory'|undefined} type Wiki 数据类型；空则清除全部 atlas
 */
export function clearRenderCache(type) {
  const atlasDir = scopeDir(CACHE_SCOPE.ATLAS)
  if (!type) {
    if (fs.existsSync(atlasDir)) {
      fs.rmSync(atlasDir, { recursive: true, force: true })
      logger.info('[yoyo-plugin][renderCache] cleared all atlas cache')
    }
    return
  }
  const subDir = DATA_TYPE_DIR[type]
  if (!subDir) return
  const target = path.join(atlasDir, subDir)
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true })
    logger.info(`[yoyo-plugin][renderCache] cleared atlas/${subDir}`)
  }
}

/**
 * 预留：用户更新角色面板时清除对应缓存（暂未接入业务）
 * @param {string} [uid]
 */
export function clearPanelCache(uid) {
  // TODO: 角色面板实现后，在 #更新面板 时按 uid 清除 panel 缓存
  const panelDir = scopeDir(CACHE_SCOPE.PANEL)
  if (!uid) {
    if (fs.existsSync(panelDir)) fs.rmSync(panelDir, { recursive: true, force: true })
    return
  }
  const target = path.join(panelDir, String(uid))
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true })
}
