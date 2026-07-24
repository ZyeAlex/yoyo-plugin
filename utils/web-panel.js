/**
 * YoAgent 配置 Web 面板 — 挂载于 Yunzai HTTP :2536/yoyo
 */
import express from 'express'
import path from 'path'
import fs from 'fs'
import { getYoyoPanelUrl } from './panel-url.js'
import { extractPanelToken, verifyPanelToken } from './panel-auth.js'
import setting from './setting.js'
import { getAgentPort } from '../api/agent/schema.js'
import {
  AGENT_RESTART_KEYS,
  WEB_FIELDS,
  WEB_SECTIONS,
  fieldVisible,
  mergeConfigPatch,
  defaultProfiles,
  PRESETS,
  PROVIDER_IDS,
  ensureApiProfiles,
  flattenActiveProfile,
} from './web-config-schema.js'
import {
  ensureAgentServerRunning,
  isAgentServerRunning,
  isAgentPortListening,
  restartAgentServer,
  startOrRestartAgentServer,
} from './agent-server.js'
import { resolveUvBin } from './uv.js'

const WEB_ROOT = '/yoyo'
const STATIC_DIR = path.join(setting.path, 'resources/web')

function json(res, code, data = {}, message = 'ok') {
  res.type('json').status(code).send({ code, message, data })
}

function embeddingConfiguredInConfig(config = {}) {
  return Boolean(
    String(config.agentEmbeddingApiKey || '').trim()
    || String(config.agentLlmApiKey || '').trim(),
  )
}

/** Agent 索引 API 暂时不可达时，用本地 manifest + 配置拼只读状态。 */
function readOfflineIndexStatus(config) {
  const manifestPath = path.join(setting.path, 'data', 'index', 'manifest.json')
  let manifest = {}
  try {
    if (fs.existsSync(manifestPath)) {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      if (parsed && typeof parsed === 'object') manifest = parsed
    }
  } catch {
    manifest = {}
  }
  const embeddingConfigured = embeddingConfiguredInConfig(config)
  const status = manifest.status || 'unknown'
  const gameTotal = Number(manifest.game_chunk_count) || 0
  const memTotal = Number(manifest.memory_chunk_count) || 0
  const memStatus = manifest.memory_status || (memTotal > 0 && status === 'ready' ? 'ready' : 'idle')
  return {
    ready: status === 'ready',
    needs_rebuild: status !== 'ready' && status !== 'building',
    game_ready: status === 'ready',
    memory_ready: memStatus === 'ready',
    memory_needs_rebuild: memStatus !== 'ready' && memStatus !== 'building',
    memory_building: memStatus === 'building',
    embedding_configured: embeddingConfigured,
    building: status === 'building',
    offline: true,
    manifest: { ...manifest, memory_status: memStatus },
    scope_counts: {
      game_lore: gameTotal,
      game_entity: 0,
      mem_global: 0,
      mem_group: 0,
      mem_user: memTotal,
      mem_daily: 0,
      emoticon: 0,
    },
    emoticon: { total: 0 },
  }
}

async function fetchAgentJson(config, apiPath, init = {}) {
  const port = getAgentPort(config)
  const url = `http://127.0.0.1:${port}${apiPath}`
  const timeoutMs = apiPath.includes('/index/rebuild') ? 600000 : 15000
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(timeoutMs),
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body }
}

function formatRebuildMessage(scope, data = {}) {
  const counts = data.scope_counts || {}
  const stats = {
    lore: counts.game_lore || data.game_chunk_count || 0,
    entity: counts.game_entity || 0,
    gameTotal: (counts.game_lore || data.game_chunk_count || 0) + (counts.game_entity || 0),
    memTotal: (counts.mem_global || 0) + (counts.mem_group || 0) + (counts.mem_user || 0) + (counts.mem_daily || 0) + (data.memory_chunk_count || 0),
  }
  const scopeLabel = scope === 'game' ? '游戏知识' : scope === 'memory' ? '群记忆' : '全部索引'
  const status = data.status || 'unknown'
  if (status === 'ready') {
    if (scope === 'game') {
      return `游戏知识索引完成：背景百科 ${stats.lore} · 游戏实体 ${stats.entity}`
    }
    return `${scopeLabel}构建完成：游戏知识 ${stats.gameTotal} 块，群记忆 ${stats.memTotal} 块`
  }
  if (status === 'failed') {
    return `索引重建失败：${data.last_error || '未知错误'}`
  }
  return `索引重建结束（${scopeLabel}）：状态 ${status}`
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
    // 仅 /yoyo（无尾斜杠）时跳转并保留 ?token=
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
      const live = setting.reloadConfig()
      const config = flattenActiveProfile(ensureApiProfiles(live))
      json(res, 200, {
        sections: WEB_SECTIONS,
        fields: WEB_FIELDS,
        config,
        defaults: readDefaults(),
        panelUrl: getYoyoPanelUrl(),
        providerIds: PROVIDER_IDS,
        defaultProfiles: defaultProfiles(),
        presets: PRESETS,
        plugin: {
          name: 'yoyo-plugin',
          title: '蓝色星原旅谣',
          subtitle: 'YoAgent 配置中心',
        },
      })
    } catch (err) {
      logger.error(`[yoyo-plugin] /api/meta 失败: ${err.message}`)
      json(res, 500, {}, err.message || '配置加载失败')
    }
  })

  router.get('/api/agent/status', async (_req, res) => {
    try {
      const config = setting.reloadConfig()
      const port = getAgentPort(config)
      let portUp = isAgentPortListening(port)
      let running = portUp || isAgentServerRunning(config)

      if (!running) {
        const uvBin = resolveUvBin(setting.path)
        await ensureAgentServerRunning(setting.path, config, uvBin)
        portUp = isAgentPortListening(port)
        running = portUp || isAgentServerRunning(config)
      }

      let health = null
      let index = null
      let indexReachable = false

      if (portUp || running) {
        try {
          const h = await fetchAgentJson(config, '/api/health')
          if (h.ok) {
            health = h.body
            running = true
          }
        } catch {}
        try {
          const i = await fetchAgentJson(config, '/api/index/status')
          if (i.ok) {
            index = i.body?.data ?? i.body
            if (index && typeof index === 'object') indexReachable = true
          }
        } catch {}
      }

      if (!indexReachable) {
        index = readOfflineIndexStatus(config)
      }

      json(res, 200, { running, port, health, index, indexReachable })
    } catch (err) {
      logger.error(`[yoyo-plugin] /api/agent/status 失败: ${err.message}`)
      const config = setting.reloadConfig()
      json(res, 200, {
        running: isAgentPortListening(getAgentPort(config)),
        port: getAgentPort(config),
        health: null,
        index: readOfflineIndexStatus(config),
        indexReachable: false,
      })
    }
  })

  router.post('/api/index/validate', async (_req, res) => {
    const config = setting.reloadConfig()
    if (!isAgentServerRunning(config)) {
      return json(res, 503, {}, 'YoAgent 未运行')
    }
    try {
      const result = await fetchAgentJson(config, '/api/index/validate', { method: 'POST', body: '{}' })
      if (!result.ok) {
        return json(res, result.status || 500, result.body?.data || {}, result.body?.message || '校验失败')
      }
      json(res, 200, result.body?.data || {}, result.body?.message || '校验通过')
    } catch (err) {
      json(res, 500, {}, err.message || String(err))
    }
  })

  router.post('/api/agent/restart', async (_req, res) => {
    try {
      const config = setting.reloadConfig()
      const port = getAgentPort(config)
      const wasRunning = isAgentPortListening(port)
      const uvBin = resolveUvBin(setting.path)
      const action = await startOrRestartAgentServer(setting.path, config, uvBin)
      const running = isAgentPortListening(port) || isAgentServerRunning(config)
      const message = action === 'started'
        ? `YoAgent 已启动（端口 ${port}）`
        : (running
          ? `YoAgent 已重启（端口 ${port}）`
          : `YoAgent 已执行重启，但未检测到端口 ${port}，请查看 server/yoagent.log`)
      json(res, 200, { action, restarted: action === 'restarted', started: action === 'started', port, running }, message)
    } catch (err) {
      json(res, 500, {}, err.message || String(err))
    }
  })

  router.post('/api/index/rebuild', async (req, res) => {
    const scope = String(req.body?.scope || 'game').trim().toLowerCase()
    if (scope !== 'game') {
      return json(res, 400, { scope }, '群记忆索引已全自动维护，面板仅支持重建游戏知识（scope=game）')
    }
    const config = setting.reloadConfig()
    if (!isAgentServerRunning(config)) {
      return json(res, 503, { scope }, 'YoAgent 未运行')
    }
    try {
      const result = await fetchAgentJson(config, '/api/index/rebuild', {
        method: 'POST',
        body: JSON.stringify({ scope, async: true }),
      })
      if (!result.ok) {
        return json(res, result.status || 500, result.body?.data || { scope }, result.body?.message || '重建失败')
      }
      const data = result.body?.data || {}
      const msg = result.body?.message || (data.started ? '已开始构建索引' : formatRebuildMessage(scope, data))
      json(res, 200, { ...data, scope }, msg)
    } catch (err) {
      json(res, 500, { scope }, err.message || String(err))
    }
  })

  router.post('/api/config', async (req, res) => {
    const patch = req.body?.config
    if (!patch || typeof patch !== 'object') {
      return json(res, 400, {}, '缺少 config 对象')
    }

    const allowed = new Set(WEB_FIELDS.filter((f) => f.key).map((f) => f.key))
    allowed.add('agentApiProfiles')

    const filtered = {}
    for (const [key, value] of Object.entries(patch)) {
      if (allowed.has(key)) filtered[key] = value
    }

    const prev = setting.reloadConfig()
    const next = mergeConfigPatch(prev, filtered)
    setting.config = next
    setting.setData('config/config', next)

    const needRestart = Object.keys(filtered).some((k) => AGENT_RESTART_KEYS.has(k))
    let restarted = false
    if (needRestart && isAgentServerRunning(next)) {
      try {
        const uvBin = resolveUvBin(setting.path)
        await restartAgentServer(setting.path, next, uvBin)
        restarted = true
      } catch (err) {
        return json(res, 200, { config: next, restarted: false, restartError: err.message }, '配置已保存，但 YoAgent 重启失败')
      }
    }

    json(res, 200, { config: next, restarted, visibleFields: WEB_FIELDS.filter((f) => fieldVisible(f, next)).map((f) => f.key) }, '保存成功')
  })

  router.use(express.static(STATIC_DIR, { index: false, maxAge: 0, etag: true }))
  router.use(
    '/theme',
    express.static(path.join(setting.path, 'resources/common/theme'), { maxAge: 0, etag: true }),
  )

  const sendPanel = (_req, res) => {
    const indexPath = path.join(STATIC_DIR, 'index.html')
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath)
    res.status(404).send('YoAgent panel not found')
  }

  router.get('/', (_req, res) => {
    const q = _req.originalUrl.includes('?') ? _req.originalUrl.slice(_req.originalUrl.indexOf('?')) : ''
    res.redirect(301, `/yoyo/basic${q}`)
  })
  for (const section of ['basic', 'fun', 'agent']) {
    router.get(`/${section}`, sendPanel)
  }

  Bot.express.use(WEB_ROOT, router)
  logger.info(`[yoyo-plugin] 配置面板: ${getYoyoPanelUrl()}`)
}
