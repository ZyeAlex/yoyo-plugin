/**
 * yoyo-plugin 配置 Web 面板 — 挂载于 Yunzai HTTP :2536/yoyo
 *
 * 面板 schema / 静态页按文件 mtime 热加载，改 resources/web 与
 * utils/web-config-schema.js 后刷新浏览器即可，无需重启 Yunzai。
 * （本文件自身改路由逻辑仍需重载插件一次。）
 */
import express from 'express'
import path from 'path'
import fs from 'fs'
import { pathToFileURL } from 'url'
import { getYoyoPanelUrl } from './panel-url.js'
import { extractPanelToken, verifyPanelToken } from './panel-auth.js'
import setting from './setting.js'

const WEB_ROOT = '/yoyo'
const STATIC_DIR = path.join(setting.path, 'resources/web')
const SCHEMA_FILE = path.join(setting.path, 'utils/web-config-schema.js')

/** @type {{ mtime: number, mod: any } | null} */
let schemaCache = null

async function loadSchema() {
  const st = fs.statSync(SCHEMA_FILE)
  if (schemaCache && schemaCache.mtime === st.mtimeMs) return schemaCache.mod
  const url = `${pathToFileURL(SCHEMA_FILE).href}?t=${st.mtimeMs}`
  const mod = await import(url)
  schemaCache = { mtime: st.mtimeMs, mod }
  return mod
}

function assetVersion(name) {
  try {
    return String(Math.floor(fs.statSync(path.join(STATIC_DIR, name)).mtimeMs))
  } catch {
    return String(Date.now())
  }
}

function json(res, code, data = {}, message = 'ok') {
  res.type('json').status(code).send({ code, message, data })
}

function readDefaults() {
  return setting.getData('config/default') || {}
}

/** 对齐 Guoba：从 Bot.gl / getGroupMap 拉群列表 */
function listBotGroups() {
  const seen = new Set()
  const items = []

  const push = (id, name) => {
    const gid = String(id ?? '').trim()
    if (!gid || seen.has(gid)) return
    seen.add(gid)
    items.push({
      group_id: gid,
      group_name: String(name || gid).trim() || gid,
    })
  }

  try {
    if (typeof Bot?.getGroupArray === 'function') {
      for (const info of Bot.getGroupArray() || []) {
        push(info?.group_id ?? info?.groupId, info?.group_name || info?.groupName || info?.name)
      }
    }
  } catch (err) {
    logger.debug?.(`[yoyo-plugin] getGroupArray: ${err.message}`)
  }

  try {
    const map = typeof Bot?.getGroupMap === 'function' ? Bot.getGroupMap() : Bot?.gl
    if (map instanceof Map) {
      for (const [id, info] of map) {
        push(info?.group_id ?? id, info?.group_name || info?.groupName || info?.name)
      }
    }
  } catch (err) {
    logger.debug?.(`[yoyo-plugin] getGroupMap: ${err.message}`)
  }

  items.sort((a, b) => a.group_name.localeCompare(b.group_name, 'zh-CN') || a.group_id.localeCompare(b.group_id))
  return items
}

function sendPanel(_req, res) {
  const indexPath = path.join(STATIC_DIR, 'index.html')
  if (!fs.existsSync(indexPath)) {
    res.status(404).send('yoyo panel not found')
    return
  }
  let html = fs.readFileSync(indexPath, 'utf8')
  const cssV = assetVersion('style.css')
  const jsV = assetVersion('app.js')
  html = html
    .replace(/href="(\/?yoyo\/)?style\.css(?:\?[^"]*)?"/g, `href="/yoyo/style.css?v=${cssV}"`)
    .replace(/src="(\/?yoyo\/)?app\.js(?:\?[^"]*)?"/g, `src="/yoyo/app.js?v=${jsV}"`)
  res.setHeader('Cache-Control', 'no-store')
  res.type('html').send(html)
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

  router.get('/api/meta', async (_req, res) => {
    try {
      const { WEB_SECTIONS, WEB_FIELDS } = await loadSchema()
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
        assets: {
          css: assetVersion('style.css'),
          js: assetVersion('app.js'),
          schema: schemaCache?.mtime || 0,
        },
      })
    } catch (err) {
      logger.error(`[yoyo-plugin] /api/meta 失败: ${err.message}`)
      json(res, 500, {}, err.message || '配置加载失败')
    }
  })

  router.get('/api/groups', (_req, res) => {
    try {
      const groups = listBotGroups()
      json(res, 200, { groups, total: groups.length })
    } catch (err) {
      logger.error(`[yoyo-plugin] /api/groups 失败: ${err.message}`)
      json(res, 500, {}, err.message || '群列表加载失败')
    }
  })

  router.post('/api/config', async (req, res) => {
    const patch = req.body?.config
    if (!patch || typeof patch !== 'object') {
      return json(res, 400, {}, '缺少 config 对象')
    }

    try {
      const { WEB_FIELDS, fieldVisible, mergeConfigPatch } = await loadSchema()
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
    } catch (err) {
      logger.error(`[yoyo-plugin] /api/config 失败: ${err.message}`)
      json(res, 500, {}, err.message || '保存失败')
    }
  })

  const ttsDir = () => {
    const dir = path.join(setting.path, 'server/data/tts')
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }
  const ttsWav = () => path.join(ttsDir(), 'default.wav')
  const ttsMeta = () => path.join(ttsDir(), 'default.json')
  const readTtsStatus = () => {
    const wav = ttsWav()
    if (!fs.existsSync(wav)) return { exists: false, prompt_text: '', filename: '', bytes: 0 }
    let prompt_text = ''
    let filename = 'default.wav'
    try {
      const meta = JSON.parse(fs.readFileSync(ttsMeta(), 'utf8'))
      prompt_text = String(meta?.prompt_text || '')
      filename = String(meta?.filename || filename)
    } catch {}
    return { exists: true, prompt_text, filename, bytes: fs.statSync(wav).size }
  }
  const chatBrainBase = () => {
    const cfg = setting.reloadConfig()
    const port = Number(cfg.chatPort || 8787)
    return `http://127.0.0.1:${Number.isFinite(port) ? port : 8787}`
  }

  router.get('/api/tts/voice', (_req, res) => {
    try {
      json(res, 200, readTtsStatus())
    } catch (err) {
      json(res, 500, {}, err.message || '读取音色失败')
    }
  })

  // 二进制直传，避开全局 express.json 默认 ~100KB 限制（base64 JSON 很容易爆）
  const readTtsUploadBody = async (req) => {
    if (Buffer.isBuffer(req.body) && req.body.length) return req.body
    if (typeof req.body === 'string' && req.body) return Buffer.from(req.body)
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > 8_000_000) throw new Error('音频过大')
      chunks.push(chunk)
    }
    return chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0)
  }

  router.post('/api/tts/voice', async (req, res) => {
    try {
      const buf = await readTtsUploadBody(req)
      if (buf.length < 64) return json(res, 400, {}, '音频太短或未收到文件')
      const filename = String(req.headers['x-filename'] || 'default.wav')
        .replace(/[^\w.\u4e00-\u9fff()-]+/g, '_')
        .slice(0, 80) || 'default.wav'
      let prompt_text = ''
      try {
        prompt_text = decodeURIComponent(String(req.headers['x-prompt-text'] || ''))
      } catch {
        prompt_text = String(req.headers['x-prompt-text'] || '')
      }
      fs.writeFileSync(ttsWav(), buf)
      fs.writeFileSync(
        ttsMeta(),
        JSON.stringify({ prompt_text, filename, updated_at: Date.now() / 1000 }, null, 2),
        'utf8',
      )
      json(res, 200, readTtsStatus(), '音色已保存')
    } catch (err) {
      logger.error(`[yoyo-plugin] /api/tts/voice 上传失败: ${err.message}`)
      json(res, 500, {}, err.message || '上传失败')
    }
  })

  router.delete('/api/tts/voice', (_req, res) => {
    try {
      for (const p of [ttsWav(), ttsMeta()]) {
        try {
          fs.unlinkSync(p)
        } catch {}
      }
      json(res, 200, readTtsStatus(), '已清除默认音色')
    } catch (err) {
      json(res, 500, {}, err.message || '清除失败')
    }
  })

  router.post('/api/tts/preview', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      const text = String(req.body?.text || '你好，我是悠悠。').trim() || '你好，我是悠悠。'
      const r = await fetch(`${chatBrainBase()}/api/tts/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!r.ok) {
        const detail = await r.text().catch(() => '')
        return json(res, 502, {}, detail.slice(0, 300) || `brain ${r.status}`)
      }
      const buf = Buffer.from(await r.arrayBuffer())
      res.status(200)
      res.setHeader('Content-Type', r.headers.get('content-type') || 'audio/wav')
      res.send(buf)
    } catch (err) {
      logger.error(`[yoyo-plugin] /api/tts/preview 失败: ${err.message}`)
      json(res, 502, {}, err.message || '试听失败，确认 #启动悠悠 与 TTS 配置')
    }
  })

  router.use(express.static(STATIC_DIR, { index: false, maxAge: 0, etag: true }))
  router.use(
    '/theme',
    express.static(path.join(setting.path, 'resources/common/theme'), { maxAge: 0, etag: true }),
  )

  router.get('/', (_req, res) => {
    const q = _req.originalUrl.includes('?') ? _req.originalUrl.slice(_req.originalUrl.indexOf('?')) : ''
    res.redirect(301, `/yoyo/basic${q}`)
  })
  for (const section of ['basic', 'chat']) {
    router.get(`/${section}`, sendPanel)
  }
  // 兼容旧「娱乐功能」链接
  router.get('/fun', (req, res) => {
    const q = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : ''
    res.redirect(301, `/yoyo/basic${q}`)
  })

  Bot.express.use(WEB_ROOT, router)
  logger.info(`[yoyo-plugin] 配置面板: ${getYoyoPanelUrl()}（schema/静态资源支持热更新）`)
}
