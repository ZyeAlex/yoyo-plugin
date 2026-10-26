/**
 * yoyo-plugin 配置 Web 面板 — 挂载于 Yunzai HTTP :2536/yoyo
 */
import express from 'express'
import path from 'path'
import fs from 'fs'
import { getYoyoPanelUrl } from './panel-url.js'
import { extractPanelToken, verifyPanelToken } from './panel-auth.js'
import setting from './setting.js'
import {
  WEB_FIELDS,
  WEB_SECTIONS,
  fieldVisible,
  mergeConfigPatch,
} from './web-config-schema.js'

const WEB_ROOT = '/yoyo'
const STATIC_DIR = path.join(setting.path, 'resources/web')

function json(res, code, data = {}, message = 'ok') {
  res.type('json').status(code).send({ code, message, data })
}

function readDefaults() {
  return setting.getData('config/default') || {}
}

export function registerWebPanel() {
  if (!Bot?.express) {
    logger.warn('[yoyo-plugin] Bot.express 不可用，跳过 /yoyo 面板注册')
    return
  }

  Bot.express.quiet.push(WEB_ROOT)
  if (Array.isArray(Bot.express.skip_auth)) {
    Bot.express.skip_auth.push(WEB_ROOT)
  }

  Bot.express.get(WEB_ROOT, (req, res, next) => {
    const pathOnly = req.originalUrl.split('?')[0]
    if (pathOnly !== WEB_ROOT) return next()
    const q = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : ''
    res.redirect(301, `${WEB_ROOT}/basic${q}`)
  })

  const router = express.Router()

  router.use('/api', async (req, res, next) => {
    try {
      const token = extractPanelToken(req)
      const userId = await verifyPanelToken(token)
      if (!userId) {
        return json(res, 401, {}, '未登录或令牌已过期，请向 Bot 发送 #悠悠登录 获取新地址')
      }
      req.yoyoPanelUserId = userId
      next()
    } catch (err) {
      logger.error(`[yoyo-plugin] 面板鉴权失败: ${err.message}`)
      json(res, 500, {}, '面板鉴权服务异常，请稍后重试')
    }
  })

  router.get('/api/meta', (_req, res) => {
    try {
      const config = setting.reloadConfig()
      json(res, 200, {
        sections: WEB_SECTIONS,
        fields: WEB_FIELDS,
        config,
        defaults: readDefaults(),
        panelUrl: getYoyoPanelUrl(),
        plugin: {
          name: 'yoyo-plugin',
          title: '蓝色星原旅谣',
          subtitle: '配置中心',
        },
      })
    } catch (err) {
      logger.error(`[yoyo-plugin] /api/meta 失败: ${err.message}`)
      json(res, 500, {}, err.message || '配置加载失败')
    }
  })

  router.post('/api/config', async (req, res) => {
    const patch = req.body?.config
    if (!patch || typeof patch !== 'object') {
      return json(res, 400, {}, '缺少 config 对象')
    }

    const allowed = new Set(WEB_FIELDS.filter((f) => f.key).map((f) => f.key))
    const filtered = {}
    for (const [key, value] of Object.entries(patch)) {
      if (allowed.has(key)) filtered[key] = value
    }

    const prev = setting.reloadConfig()
    const next = mergeConfigPatch(prev, filtered)
    setting.config = next
    setting.setData('config/config', next)

    json(res, 200, {
      config: next,
      visibleFields: WEB_FIELDS.filter((f) => fieldVisible(f, next)).map((f) => f.key),
    }, '保存成功')
  })

  router.use(express.static(STATIC_DIR, { index: false, maxAge: 0, etag: true }))
  router.use(
    '/theme',
    express.static(path.join(setting.path, 'resources/common/theme'), { maxAge: 0, etag: true }),
  )

  const sendPanel = (_req, res) => {
    const indexPath = path.join(STATIC_DIR, 'index.html')
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath)
    res.status(404).send('yoyo panel not found')
  }

  router.get('/', (_req, res) => {
    const q = _req.originalUrl.includes('?') ? _req.originalUrl.slice(_req.originalUrl.indexOf('?')) : ''
    res.redirect(301, `/yoyo/basic${q}`)
  })
  for (const section of ['basic', 'fun', 'chat']) {
    router.get(`/${section}`, sendPanel)
  }

  Bot.express.use(WEB_ROOT, router)
  logger.info(`[yoyo-plugin] 配置面板: ${getYoyoPanelUrl()}`)
}
