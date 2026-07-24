const API = '/yoyo/api'
const VALID_SECTIONS = new Set(['basic', 'fun', 'agent'])
const DEFAULT_SECTION = 'basic'
const BUILD_STATE_KEY = 'yoyo_panel_build_state'

let panelToken = ''

function initPanelToken() {
  const params = new URLSearchParams(location.search)
  const fromUrl = params.get('token')
  if (fromUrl) {
    panelToken = fromUrl
    sessionStorage.setItem('yoyo_panel_token', fromUrl)
    params.delete('token')
    const qs = params.toString()
    history.replaceState({}, '', `${location.pathname}${qs ? `?${qs}` : ''}`)
    return
  }
  panelToken = sessionStorage.getItem('yoyo_panel_token') || ''
}

initPanelToken()

let meta = null
let draft = {}
let activeSection = 'basic'
let dirty = false

const $ = (sel) => document.querySelector(sel)
const nav = $('#nav')
const form = $('#form')
const toast = $('#toast')
const dirtyDot = $('#dirty-dot')

function setDirty(value) {
  dirty = value
  dirtyDot.classList.toggle('hidden', !dirty)
  $('#save-hint').textContent = dirty ? '有未保存的修改' : '所有修改写入 config/config.yaml'
}

function showToast(message, type = 'ok', duration = 5000) {
  toast.textContent = message
  toast.className = `toast ${type}`
  toast.classList.remove('hidden')
  clearTimeout(showToast._t)
  if (duration > 0) {
    showToast._t = setTimeout(() => toast.classList.add('hidden'), duration)
  }
}

const BUILD_PHASE_PCT = {
  start: 5,
  game_chunks: 15,
  game_embed: 35,
  game_write: 50,
  memory_chunks: 55,
  memory_embed: 75,
  memory_write: 90,
  finalize: 95,
}

const REBUILD_SCOPE_META = {
  game: {
    label: '游戏知识',
    hint: 'BWIKI 背景页 + 角色 / 奇波 / 装备 / 套装等实体',
    btnLoading: '校验游戏知识…',
  },
}

const BUILD_PHASE_LABELS = {
  start: '准备构建',
  game_chunks: '切片游戏知识（背景百科 + 游戏实体）',
  game_embed: 'Embedding 游戏知识',
  game_write: '写入游戏向量库',
  memory_chunks: '切片群记忆',
  memory_embed: 'Embedding 群记忆',
  memory_write: '写入记忆向量库',
  finalize: '汇总索引状态',
}

let activeRebuildScope = null

let statusPollTimer = null
let rebuildBusy = false
let buildErrorSticky = null
let lastBuildProgressKey = ''
let lastBuildProgressAt = 0

const FIELD_MODEL_STATUS = {
  'profile:llmModel': { target: 'llm', modelCheck: 'llm_model', connCheck: 'llm_api' },
  'profile:visionModel': { target: 'vision', modelCheck: 'vision_model', connCheck: 'vision_api' },
  agentEmbeddingModel: { target: 'embedding', modelCheck: 'embedding_model', connCheck: 'embedding_api' },
}

let modelStatusState = {
  loadingTargets: new Set(),
  data: null,
  error: null,
}

const MODEL_PROBE_TARGETS = ['llm', 'vision', 'embedding']
const MODEL_STATUS_KEY = 'yoyo_panel_model_status'

function modelStatusConfigKey(config = draft) {
  ensureProfiles()
  const provider = config.agentApiProvider || 'siliconflow'
  const profile = (config.agentApiProfiles && config.agentApiProfiles[provider]) || {}
  return JSON.stringify({
    p: provider,
    k: profile.apiKey || '',
    b: profile.baseUrl || '',
    l: profile.llmModel || '',
    v: profile.visionModel || '',
    ek: config.agentEmbeddingApiKey || '',
    eb: config.agentEmbeddingBaseUrl || '',
    em: config.agentEmbeddingModel || '',
  })
}

function saveModelStatusCache() {
  if (!modelStatusState.data?.checks?.length) return
  try {
    sessionStorage.setItem(MODEL_STATUS_KEY, JSON.stringify({
      configKey: modelStatusConfigKey(),
      data: modelStatusState.data,
      updatedAt: Date.now(),
    }))
  } catch {}
}

function loadModelStatusCache(config = draft) {
  try {
    const raw = sessionStorage.getItem(MODEL_STATUS_KEY)
    if (!raw) return false
    const saved = JSON.parse(raw)
    if (saved.configKey !== modelStatusConfigKey(config)) return false
    if (saved.data?.checks?.length) {
      modelStatusState.data = saved.data
      return true
    }
  } catch {}
  return false
}

function clearModelStatusCache() {
  try {
    sessionStorage.removeItem(MODEL_STATUS_KEY)
  } catch {}
  modelStatusState.data = null
  modelStatusState.error = null
}

function saveBuildState() {
  try {
    sessionStorage.setItem(BUILD_STATE_KEY, JSON.stringify({
      rebuildBusy,
      activeRebuildScope,
      buildErrorSticky,
      updatedAt: Date.now(),
    }))
  } catch {}
}

function loadBuildState() {
  try {
    return JSON.parse(sessionStorage.getItem(BUILD_STATE_KEY) || '{}')
  } catch {
    return {}
  }
}

function clearBuildState() {
  try {
    sessionStorage.removeItem(BUILD_STATE_KEY)
  } catch {}
}

function sectionFromPath() {
  const parts = location.pathname.replace(/\/+$/, '').split('/')
  const last = parts[parts.length - 1] || ''
  if (VALID_SECTIONS.has(last)) return last
  return DEFAULT_SECTION
}

function sectionPath(id) {
  return `/yoyo/${id}${location.search}`
}

function navigateToSection(id, { replace = false } = {}) {
  if (!VALID_SECTIONS.has(id)) id = DEFAULT_SECTION
  activeSection = id
  const url = sectionPath(id)
  if (replace) history.replaceState({ section: id }, '', url)
  else history.pushState({ section: id }, '', url)
  renderNav()
  renderForm()
  updateBuildBanner()
  if (id === 'agent') autoProbeModelStatus()
}

function isIndexBuilding(idx = {}, manifest = {}) {
  return Boolean(
    idx.building
    || idx.game_building
    || idx.memory_building
    || manifest.status === 'building',
  )
}

function memorySyncHint(idx = {}, manifest = {}) {
  if (!idx.embedding_configured) return '需配置 Embedding'
  if (idx.memory_building || (manifest.build_phase || '').startsWith('memory_')) {
    return '自动维护 · 同步中…'
  }
  if (manifest.memory_status === 'failed') return '自动维护 · 同步失败'
  if (idx.memory_ready || manifest.memory_status === 'ready') {
    return '自动维护 · 已同步'
  }
  if (idx.memory_needs_rebuild) return '自动维护 · 排队同步…'
  return '自动维护 · 写入后后台同步'
}

function updateBuildBanner() {
  const banner = $('#build-banner')
  const text = $('#build-banner-text')
  if (!banner || !text) return
  const onAgent = activeSection === 'agent'
  const show = !onAgent && (rebuildBusy || buildErrorSticky)
  if (!show) {
    banner.classList.add('hidden')
    return
  }
  const label = $('#build-label')?.textContent || '索引构建中…'
  text.textContent = buildErrorSticky || label
  banner.classList.remove('hidden')
}

function noteBuildProgress(manifest = {}) {
  const key = `${manifest.build_phase || ''}|${manifest.build_message || ''}|${manifest.build_pct ?? ''}`
  const now = Date.now()
  if (key !== lastBuildProgressKey) {
    lastBuildProgressKey = key
    lastBuildProgressAt = now
    return
  }
  if (now - lastBuildProgressAt > 120000 && manifest.status === 'building') {
    const detail = $('#build-error-detail')
    if (detail) {
      detail.textContent = '超过 2 分钟无新进度：可能卡在 Embedding API（检查 Key/网络）或 YoAgent 日志；刷新页面会继续同步服务端状态。'
      detail.classList.remove('hidden')
    }
  }
}

function clearBuildUi() {
  buildErrorSticky = null
  activeRebuildScope = null
  lastBuildProgressKey = ''
  lastBuildProgressAt = 0
  clearBuildState()
  const track = $('#build-track')
  track?.classList.add('hidden')
  track?.classList.remove('is-error', 'is-ok')
  $('#build-scope')?.classList.add('hidden')
  const buildScope = $('#build-scope')
  if (buildScope) buildScope.textContent = ''
  $('#validate-list')?.classList.add('hidden')
  $('#validate-list').innerHTML = ''
  $('#build-error-detail')?.classList.add('hidden')
  $('#build-error-detail').textContent = ''
  const fill = $('#build-fill')
  if (fill) fill.style.width = '0%'
  updateBuildBanner()
}

function showBuildError(message, { checks, detail } = {}) {
  const msg = message || '操作失败'
  buildErrorSticky = msg
  const track = $('#build-track')
  const fill = $('#build-fill')
  const label = $('#build-label')
  const pctEl = $('#build-pct')
  const detailEl = $('#build-error-detail')
  if (!track || !fill || !label || !pctEl) return

  track.classList.remove('hidden', 'is-ok')
  track.classList.add('is-error')
  fill.style.width = '100%'
  label.textContent = msg
  pctEl.textContent = '失败'

  if (checks?.length) renderValidateChecks(checks)

  if (detailEl) {
    if (detail) {
      detailEl.textContent = detail
      detailEl.classList.remove('hidden')
    } else {
      detailEl.textContent = ''
      detailEl.classList.add('hidden')
    }
  }
  saveBuildState()
  updateBuildBanner()
}

function formatIndexCounts(counts = {}, emoticon = {}) {
  const lore = counts.game_lore || 0
  const entity = counts.game_entity || 0
  const gameTotal = lore + entity
  const memGlobal = counts.mem_global || 0
  const memGroup = counts.mem_group || 0
  const memUser = counts.mem_user || 0
  const memDaily = counts.mem_daily || 0
  const memTotal = memGlobal + memGroup + memUser + memDaily
  const emoTotal = emoticon.total ?? counts.emoticon ?? 0
  const emoPaused = emoticon.indexing_paused === true
  return {
    lore,
    entity,
    gameTotal,
    memGlobal,
    memGroup,
    memUser,
    memDaily,
    memTotal,
    emoTotal,
    emoPaused,
    gameLine: `背景百科 ${lore} · 游戏实体 ${entity}`,
    memoryLine: `全局 ${memGlobal} · 本群 ${memGroup} · 用户 ${memUser} · 日报 ${memDaily}`,
    emoticonLine: emoPaused ? `共 ${emoTotal} 张 · 入库已暂停` : `共 ${emoTotal} 张`,
    summary(scope) {
      if (scope === 'game') {
        return `游戏知识 ${gameTotal} 块（背景百科 ${lore} · 游戏实体 ${entity}）`
      }
      return `游戏知识 ${gameTotal} 块 + 群记忆 ${memTotal} 块`
    },
  }
}

function updateIndexBreakdown(counts = {}, emoticon = {}) {
  const stats = formatIndexCounts(counts, emoticon)
  const gameEl = $('#index-game-counts')
  const memEl = $('#index-memory-counts')
  const emoEl = $('#index-emoticon-counts')
  const memHint = $('#index-memory-hint')
  if (gameEl) gameEl.textContent = stats.gameLine
  if (memEl) memEl.textContent = stats.memoryLine
  if (emoEl) emoEl.textContent = stats.emoticonLine
  const emoHint = $('#index-emoticon-hint')
  if (emoHint) {
    if (stats.emoPaused) {
      emoHint.textContent = '⚠ 视觉模型异常，表情包入库已暂停'
      emoHint.classList.add('index-warning')
    } else {
      emoHint.textContent = '视觉打标合格才入库 · 超保底自动淘汰冷门'
      emoHint.classList.remove('index-warning')
    }
  }
  if (memHint && lastAgentStatus?.index) {
    memHint.textContent = memorySyncHint(lastAgentStatus.index, lastAgentStatus.index.manifest || {})
  }
}

function setBuildScopeHint(scope) {
  const el = $('#build-scope')
  if (!el) return
  const meta = REBUILD_SCOPE_META[scope]
  if (!meta) {
    el.classList.add('hidden')
    el.textContent = ''
    return
  }
  el.textContent = `正在重建：${meta.label}（${meta.hint}）`
  el.classList.remove('hidden')
}

function humanBuildMessage(phase, message) {
  if (message && !BUILD_PHASE_LABELS[phase]) return message
  if (message && message !== BUILD_PHASE_LABELS[phase]) return message
  return BUILD_PHASE_LABELS[phase] || message || '正在构建索引…'
}

function setPill(el, text, tone = '') {
  if (!el) return
  el.textContent = text
  el.className = `pill${tone ? ` ${tone}` : ''}`
}

function renderValidateChecks(checks = []) {
  const list = $('#validate-list')
  if (!list) return
  if (!checks.length) {
    list.classList.add('hidden')
    list.innerHTML = ''
    return
  }
  list.innerHTML = checks.map((c) => {
    const cls = c.ok ? 'ok' : 'fail'
    const mark = c.ok ? '✓' : '✗'
    const detail = c.message ? ` · ${c.message}` : ''
    return `<li class="${cls}"><span class="mark">${mark}</span>${escapeHtml(c.label)}${escapeHtml(detail)}</li>`
  }).join('')
  list.classList.remove('hidden')
}

function checksById(checks = []) {
  return Object.fromEntries((checks || []).map((c) => [c.id, c]))
}

function mergeValidationChecks(existing = [], incoming = []) {
  const map = checksById(existing)
  for (const item of incoming || []) {
    map[item.id] = item
  }
  return Object.values(map)
}

function isModelLoading(target) {
  return modelStatusState.loadingTargets.has(target)
}

function modelConnStatus(mapping, map, { loading = false, agentUp = false } = {}) {
  if (loading) return { tone: 'warn', text: '检测中…', detail: '' }
  const model = map?.[mapping.modelCheck]
  const conn = map?.[mapping.connCheck]
  if (model && !model.ok) {
    return { tone: 'err', text: '未配置', detail: model.message || '' }
  }
  if (conn) {
    if (conn.ok) return { tone: 'ok', text: '已连接', detail: conn.message || '' }
    return { tone: 'err', text: '连接失败', detail: conn.message || '' }
  }
  if (!agentUp) {
    return { tone: 'err', text: '连接失败', detail: 'YoAgent 未运行' }
  }
  return { tone: 'warn', text: '检测中…', detail: '' }
}

function renderModelConnBadge(field) {
  if (activeSection !== 'agent') return ''
  const mapping = FIELD_MODEL_STATUS[fieldId(field)]
  if (!mapping) return ''
  const map = modelStatusState.data?.checks ? checksById(modelStatusState.data.checks) : null
  const loading = isModelLoading(mapping.target)
  const agentUp = Boolean(lastAgentStatus?.running)
  const st = modelConnStatus(mapping, map, { loading, agentUp })
  const hint = st.detail || '点击重新检测'
  const title = ` title="${escapeAttr(hint)}"`
  const disabled = loading ? 'disabled' : ''
  return `<button type="button" class="pill field-conn-pill is-clickable ${st.tone}" data-model-target="${mapping.target}"${title} ${disabled}>${escapeHtml(st.text)}</button>`
}

function renderGroupHead(group) {
  if (!group.label) return ''
  return `
    <div class="group-head">
      <h3 class="group-title">${escapeHtml(group.label)}</h3>
    </div>
  `
}

async function fetchModelValidation(target = null) {
  const isPartial = Boolean(target)
  if (isPartial) {
    modelStatusState.loadingTargets.add(target)
  }
  modelStatusState.error = null
  if (activeSection === 'agent') renderForm()

  try {
    const body = isPartial ? JSON.stringify({ target }) : '{}'
    const { data } = await api('/index/validate', { method: 'POST', body, timeoutMs: 90000 })
    if (isPartial) {
      const merged = mergeValidationChecks(modelStatusState.data?.checks, data?.checks)
      modelStatusState.data = {
        ...(modelStatusState.data || {}),
        ...data,
        checks: merged,
        ok: merged.every((c) => c.ok),
      }
    } else {
      modelStatusState.data = data
    }
    saveModelStatusCache()
    return modelStatusState.data
  } catch (err) {
    modelStatusState.error = err.message || '检测失败'
    throw err
  } finally {
    if (isPartial) modelStatusState.loadingTargets.delete(target)
    if (activeSection === 'agent') renderForm()
  }
}

function autoProbeModelStatus() {
  if (activeSection !== 'agent' || !lastAgentStatus?.running) return
  const map = checksById(modelStatusState.data?.checks)
  let pending = false
  for (const target of MODEL_PROBE_TARGETS) {
    const mapping = Object.values(FIELD_MODEL_STATUS).find((m) => m.target === target)
    if (!mapping) continue
    if (map[mapping.connCheck] || isModelLoading(target)) continue
    pending = true
    fetchModelValidation(target).catch(() => {})
  }
  return pending
}

async function refreshSingleModelStatus(target) {
  if (!target) return
  if (!lastAgentStatus?.running) {
    showToast('YoAgent 未运行，无法检测连接', 'err')
    return
  }
  if (dirty) {
    showToast('将检测已保存的配置；未保存的修改请先点「保存配置」', 'warn', 4500)
  }
  const labels = { llm: 'LLM', vision: '视觉模型', embedding: 'Embedding' }
  try {
    const data = await fetchModelValidation(target)
    const mapping = Object.values(FIELD_MODEL_STATUS).find((m) => m.target === target)
    const map = checksById(data?.checks)
    const st = mapping ? modelConnStatus(mapping, map, { agentUp: true }) : null
    const label = labels[target] || target
    if (st?.text === '已连接') {
      showToast(`${label} 连接正常`, 'ok', 3500)
    } else {
      showToast(st?.detail ? `${label}：${st.detail}` : `${label} 连接异常`, 'err', 5000)
    }
  } catch (err) {
    showToast(err.message || '检测失败', 'err')
  }
}

function setBuildProgress(phase, message, pctOverride) {
  buildErrorSticky = null
  const track = $('#build-track')
  const fill = $('#build-fill')
  const label = $('#build-label')
  const pctEl = $('#build-pct')
  const detailEl = $('#build-error-detail')
  if (!track || !fill || !label || !pctEl) return

  track.classList.remove('hidden', 'is-error', 'is-ok')
  detailEl?.classList.add('hidden')
  if (detailEl) detailEl.textContent = ''

  const pct = pctOverride ?? BUILD_PHASE_PCT[phase] ?? (phase ? 8 : 0)
  fill.style.width = `${pct}%`
  label.textContent = message || phase || ''
  pctEl.textContent = `${pct}%`
  saveBuildState()
  updateBuildBanner()
}

function showBuildSuccess(message) {
  buildErrorSticky = null
  const track = $('#build-track')
  const fill = $('#build-fill')
  const label = $('#build-label')
  const pctEl = $('#build-pct')
  if (!track || !fill || !label || !pctEl) return

  track.classList.remove('hidden', 'is-error')
  track.classList.add('is-ok')
  fill.style.width = '100%'
  label.textContent = message || '索引构建完成'
  pctEl.textContent = '完成'
  $('#build-error-detail')?.classList.add('hidden')
  clearBuildState()
  updateBuildBanner()
  setTimeout(() => {
    if (!rebuildBusy && !buildErrorSticky) clearBuildUi()
  }, 5000)
}

function indexStatusLabel(idx = {}, { running = false, indexReachable = true } = {}) {
  const manifest = idx.manifest || {}

  if (idx.embedding_configured === false) {
    return { text: '索引 · 未配置 Embedding', tone: 'warn' }
  }

  if (!indexReachable || idx.offline) {
    if (!idx.embedding_configured) {
      return { text: '索引 · 未配置 Embedding', tone: 'warn' }
    }
    if (manifest.status === 'ready') {
      return { text: '索引 · 可用', tone: 'ok' }
    }
    if (manifest.status === 'building') {
      return { text: '索引 · 构建中', tone: 'warn' }
    }
    if (manifest.status === 'failed') {
      return { text: '索引 · 失败', tone: 'err' }
    }
    return { text: running ? '索引 · 同步中' : '索引 · 待启动 Agent', tone: 'warn' }
  }

  if (idx.embedding_configured == null) {
    return { text: '索引 · 状态未知', tone: 'warn' }
  }

  if (idx.memory_building) return { text: '索引 · 群记忆同步中', tone: 'warn' }
  if (idx.game_building || (rebuildBusy && isIndexBuilding(idx, manifest))) {
    return { text: '索引 · 构建中', tone: 'warn' }
  }
  if (manifest.status === 'failed' || manifest.memory_status === 'failed') {
    return { text: '索引 · 失败', tone: 'err' }
  }
  if (idx.ready || (idx.game_ready && idx.memory_ready)) return { text: '索引 · 可用', tone: 'ok' }
  if (idx.game_ready && idx.memory_needs_rebuild) {
    return { text: '索引 · 可用（群记忆同步中）', tone: 'ok' }
  }
  if (idx.needs_rebuild && manifest.status === 'ready') {
    return { text: '索引 · 可用（后台同步中）', tone: 'ok' }
  }
  if (idx.needs_rebuild) return { text: '索引 · 待同步', tone: 'warn' }
  return { text: `索引 · ${manifest.status || '未就绪'}`, tone: 'warn' }
}

function stopStatusPoll() {
  if (statusPollTimer) {
    clearInterval(statusPollTimer)
    statusPollTimer = null
  }
}

function startStatusPoll() {
  stopStatusPoll()
  statusPollTimer = setInterval(() => {
    refreshStatus().catch(() => {})
  }, 2000)
}

function syncBuildUi(data) {
  const idx = data?.index || {}
  const manifest = idx.manifest || {}
  const building = isIndexBuilding(idx, manifest)

  if (building) {
    rebuildBusy = rebuildBusy || Boolean(activeRebuildScope)
    const phase = manifest.build_phase || 'start'
    const msg = humanBuildMessage(phase, manifest.build_message)
    const pct = Number.isFinite(manifest.build_pct) ? manifest.build_pct : undefined
    setBuildProgress(phase, msg, pct)
    if (activeRebuildScope) setBuildScopeHint(activeRebuildScope)
    else {
      const saved = loadBuildState()
      if (saved.activeRebuildScope) {
        activeRebuildScope = saved.activeRebuildScope
        setBuildScopeHint(activeRebuildScope)
      }
    }
    noteBuildProgress(manifest)
    $('#validate-list')?.classList.add('hidden')
    if (!statusPollTimer) startStatusPoll()
    saveBuildState()
    return true
  }

  if (idx.memory_building) {
    const phase = manifest.build_phase || 'memory_chunks'
    const msg = humanBuildMessage(phase, manifest.build_message)
    const pct = Number.isFinite(manifest.build_pct) ? manifest.build_pct : undefined
    setBuildProgress(phase, msg, pct)
    $('#build-scope')?.classList.add('hidden')
    if (!statusPollTimer) startStatusPoll()
    return true
  }

  if (rebuildBusy) return true

  if (manifest.status === 'failed') {
    stopStatusPoll()
    rebuildBusy = false
    const detail = manifest.last_error || ''
    showBuildError(detail ? '索引构建失败' : (buildErrorSticky || '索引构建失败'), { detail: detail || undefined })
    saveBuildState()
    return false
  }

  if (buildErrorSticky) {
    showBuildError(buildErrorSticky)
    return false
  }

  if (manifest.status === 'ready' && !rebuildBusy) {
    stopStatusPoll()
    clearBuildState()
  }
  return false
}

function ensureProfiles() {
  if (!draft.agentApiProfiles) {
    draft.agentApiProfiles = structuredClone(meta?.defaultProfiles || {})
  }
  for (const id of meta?.providerIds || []) {
    const defaults = meta.defaultProfiles?.[id] || {}
    if (!draft.agentApiProfiles[id]) {
      draft.agentApiProfiles[id] = structuredClone(defaults)
      continue
    }
    for (const [key, value] of Object.entries(defaults)) {
      if (draft.agentApiProfiles[id][key] == null || draft.agentApiProfiles[id][key] === '') {
        if (value != null && value !== '') draft.agentApiProfiles[id][key] = value
      }
    }
  }
  if (!draft.agentApiProvider) draft.agentApiProvider = 'siliconflow'
}

function activeProvider() {
  ensureProfiles()
  return draft.agentApiProvider
}

function activeProfile() {
  ensureProfiles()
  return draft.agentApiProfiles[activeProvider()]
}

function fieldVisible(field, config) {
  if (field.showWhenProvider) {
    return config.agentApiProvider === field.showWhenProvider
  }
  if (!field.showWhen) return true
  return Object.entries(field.showWhen).every(([k, v]) => config[k] === v)
}

function fieldId(field) {
  return field.profileKey ? `profile:${field.profileKey}` : field.key
}

function readFieldValue(field) {
  if (field.profileKey) return activeProfile()[field.profileKey]
  return draft[field.key]
}

function writeFieldValue(field, value) {
  if (field.profileKey) {
    ensureProfiles()
    activeProfile()[field.profileKey] = value
    return
  }
  draft[field.key] = value
}

function sectionFields(sectionId) {
  return meta.fields.filter((f) => f.section === sectionId && fieldVisible(f, draft))
}

function groupedFields(fields) {
  const groups = []
  const map = new Map()
  for (const field of fields) {
    const id = field.group || '_default'
    if (!map.has(id)) {
      const item = {
        id,
        label: field.groupLabel || '',
        fields: [],
      }
      map.set(id, item)
      groups.push(item)
    }
    map.get(id).fields.push(field)
  }
  return groups
}

function renderNav() {
  nav.innerHTML = meta.sections.map((s) => `
    <a class="nav-btn ${s.id === activeSection ? 'active' : ''}" href="/yoyo/${s.id}" data-section="${s.id}">
      <span class="icon">${s.icon || '•'}</span>
      <span class="nav-label">${escapeHtml(s.label)}</span>
    </a>
  `).join('')

  nav.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      navigateToSection(btn.dataset.section)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  })
}

function renderSwitch(field, val) {
  const on = !!val
  const id = fieldId(field)
  return `<div class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}" data-field-id="${id}" tabindex="0"></div>`
}

function renderTags(field, val) {
  const values = Array.isArray(val) ? val : []
  const id = fieldId(field)
  return `
    <div class="tags" data-field-id="${id}">
      ${values.map((v, i) => `<span class="tag">${escapeHtml(v)}<button type="button" data-remove="${i}">×</button></span>`).join('')}
    </div>
    <div class="tag-input-row">
      <input type="text" placeholder="输入后回车添加" data-tag-input="${id}" />
    </div>
  `
}

function renderSelect(field, val) {
  const id = fieldId(field)
  return `
    <select data-field-id="${id}">
      ${field.options.map((o) => `<option value="${escapeAttr(o.value)}" ${o.value === val ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
    </select>
  `
}

function renderControl(field) {
  const val = readFieldValue(field)
  const id = fieldId(field)
  switch (field.type) {
    case 'switch':
      return renderSwitch(field, val)
    case 'tags':
      return renderTags(field, val)
    case 'select':
      return renderSelect(field, val)
    case 'number':
      return `<input type="number" data-field-id="${id}" value="${escapeAttr(val ?? '')}" min="${field.min ?? ''}" max="${field.max ?? ''}" />`
    case 'password':
      return `<input type="password" data-field-id="${id}" value="${escapeAttr(val ?? '')}" autocomplete="off" />`
    default:
      return `<input type="text" data-field-id="${id}" value="${escapeAttr(val ?? '')}" />`
  }
}

function renderProviderPortalLink(field) {
  if (field.key !== 'agentApiProvider') return ''
  const provider = activeProvider()
  const opt = (field.options || []).find((o) => o.value === provider)
  if (!opt?.portalUrl) return ''
  const name = String(opt.label || '').replace(/（.*?）/g, '').trim() || provider
  return `<a class="provider-portal-link" href="${escapeAttr(opt.portalUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)} ↗</a>`
}

function renderFieldHeadExtra(field) {
  if (field.key === 'agentApiProvider') return renderProviderPortalLink(field)
  return renderModelConnBadge(field)
}

function renderField(field) {
  const isRow = field.layout === 'row' || field.type === 'switch'
  const spanClass = field.span === 2 ? 'span-2' : ''
  const control = renderControl(field)
  const fid = fieldId(field)

  if (isRow && field.type === 'switch') {
    return `
      <div class="field row ${spanClass}" data-field-id="${fid}">
        <div class="field-body">
          <label>${escapeHtml(field.label)}</label>
          ${field.help ? `<div class="help">${escapeHtml(field.help)}</div>` : ''}
        </div>
        ${control}
      </div>
    `
  }

  return `
    <div class="field ${spanClass}" data-field-id="${fid}">
      <div class="field-head field-head-actions">
        <label>${escapeHtml(field.label)}</label>
        ${renderFieldHeadExtra(field)}
      </div>
      ${control}
      ${field.help ? `<div class="help">${escapeHtml(field.help)}</div>` : ''}
    </div>
  `
}

function renderGroupCard(group, extraBanner = '') {
  const fieldsHtml = group.fields.map(renderField).join('')
  const title = group.label ? renderGroupHead(group) : ''
  return `
    <section class="group-card card">
      ${title}
      ${extraBanner}
      <div class="form-grid">${fieldsHtml}</div>
    </section>
  `
}

function updateSectionHero(section) {
  const isAgent = activeSection === 'agent'
  $('#section-eyebrow').textContent = isAgent ? 'YoAgent · config/config.yaml' : 'config/config.yaml'
  $('#section-title').innerHTML = `<span class="title-accent">${escapeHtml(section?.label || activeSection)}</span>`
  $('#section-desc').textContent = section?.desc || '修改写入 config/config.yaml'
  $('#agent-bar').classList.toggle('hidden', !isAgent)
}

function renderForm() {
  if (!meta) return
  const section = meta.sections.find((s) => s.id === activeSection)
  updateSectionHero(section)

  const fields = sectionFields(activeSection)
  if (!fields.length) {
    form.innerHTML = '<p class="muted empty-tip">当前分组无可见配置项</p>'
    return
  }

  const groups = groupedFields(fields)
  form.innerHTML = groups.map((group) => renderGroupCard(group)).join('')

  bindFormEvents()
  bindModelStatusEvents()
  if (activeSection === 'agent') {
    queueMicrotask(() => autoProbeModelStatus())
  }
}

function bindModelStatusEvents() {
  form.querySelectorAll('.field-conn-pill[data-model-target]').forEach((btn) => {
    btn.addEventListener('click', () => refreshSingleModelStatus(btn.dataset.modelTarget))
  })
}

function findFieldById(id) {
  return meta.fields.find((f) => fieldId(f) === id)
}

function bindFormEvents() {
  form.querySelectorAll('.switch').forEach((el) => {
    el.addEventListener('click', () => {
      const field = findFieldById(el.dataset.fieldId)
      if (!field) return
      writeFieldValue(field, !readFieldValue(field))
      setDirty(true)
      if (field.key === 'agentApiProvider') {
        renderNav()
        renderForm()
      } else {
        el.classList.toggle('on', readFieldValue(field))
      }
    })
  })

  form.querySelectorAll('input[data-field-id], select[data-field-id]').forEach((el) => {
    const handler = () => {
      const field = findFieldById(el.dataset.fieldId)
      if (!field) return
      const value = field.type === 'number' ? Number(el.value) : el.value
      writeFieldValue(field, value)
      setDirty(true)
      if (field.key === 'agentApiProvider') {
        renderNav()
        renderForm()
      }
    }
    el.addEventListener('change', handler)
    if (el.tagName === 'INPUT' && el.type !== 'number') el.addEventListener('input', handler)
  })

  form.querySelectorAll('[data-tag-input]').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      const field = findFieldById(input.dataset.tagInput)
      if (!field) return
      const text = input.value.trim()
      if (!text) return
      const list = Array.isArray(readFieldValue(field)) ? [...readFieldValue(field)] : []
      if (!list.includes(text)) list.push(text)
      writeFieldValue(field, list)
      input.value = ''
      setDirty(true)
      renderForm()
    })
  })

  form.querySelectorAll('.tag button[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const field = findFieldById(btn.closest('.tags').dataset.fieldId)
      if (!field) return
      const list = [...readFieldValue(field)]
      list.splice(Number(btn.dataset.remove), 1)
      writeFieldValue(field, list)
      setDirty(true)
      renderForm()
    })
  })
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function escapeAttr(s) {
  return escapeHtml(s)
}

async function api(path, init = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  }
  if (panelToken) headers['X-Yoyo-Token'] = panelToken

  const timeoutMs = init.timeoutMs ?? 15000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${API}${path}`, {
      headers,
      ...init,
      signal: controller.signal,
    })
    const body = await res.json().catch(() => ({}))
    if (res.status === 401) {
      sessionStorage.removeItem('yoyo_panel_token')
      panelToken = ''
      throw new Error(body.message || '登录已过期，请发送 #悠悠登录 获取新地址')
    }
    if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`)
    return body
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('请求超时，请检查 Yunzai 是否正常运行')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function withButtonLoading(btn, label, fn) {
  if (!btn) return fn()
  const old = btn.textContent
  btn.disabled = true
  btn.classList.add('is-loading')
  btn.textContent = label
  try {
    return await fn()
  } finally {
    btn.disabled = false
    btn.classList.remove('is-loading')
    btn.textContent = old
  }
}

function formatTime(iso) {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

let lastAgentStatus = null

function updateAgentBar(data) {
  const running = data?.running
  const port = data?.port
  const idx = data?.index || {}
  const counts = idx.scope_counts || {}
  const emoticon = idx.emoticon || {}
  updateIndexBreakdown(counts, emoticon)

  const agentLabel = running
    ? `Agent · 运行中 :${port}${data?.stale ? '（刷新延迟）' : ''}`
    : (data?.stale ? 'Agent · 状态未知' : 'Agent · 未运行')
  setPill($('#pill-agent'), agentLabel, running ? 'ok' : 'warn')

  const indexLabel = indexStatusLabel(idx, {
    running,
    indexReachable: data?.indexReachable !== false,
  })
  setPill($('#pill-index'), indexLabel.text, indexLabel.tone)

  const building = syncBuildUi(data)
  const disableOps = rebuildBusy || building
  updateAgentPowerButton(running)
  ;['#btn-restart', '#btn-rebuild-game'].forEach((sel) => {
    const btn = $(sel)
    if (btn) btn.disabled = disableOps
  })
}

function updateAgentPowerButton(running) {
  const btn = $('#btn-restart')
  if (!btn) return
  const isRunning = Boolean(running)
  btn.textContent = isRunning ? '重启 YoAgent' : '启动 YoAgent'
  btn.dataset.agentRunning = isRunning ? '1' : '0'
}

async function resumeIndexBuildUi() {
  try {
    const { data } = await api('/agent/status')
    lastAgentStatus = data
    updateAgentBar(data)
    const manifest = data?.index?.manifest || {}
    const building = isIndexBuilding(data?.index || {}, manifest)
    if (building) {
      const saved = loadBuildState()
      if (saved.activeRebuildScope) activeRebuildScope = saved.activeRebuildScope
      if (saved.buildErrorSticky) buildErrorSticky = saved.buildErrorSticky
      syncBuildUi(data)
      return
    }
    if (manifest.status === 'failed') {
      const saved = loadBuildState()
      if (saved.rebuildBusy || saved.buildErrorSticky) {
        showBuildError('索引构建失败', { detail: manifest.last_error || saved.buildErrorSticky })
      }
      return
    }
    if (loadBuildState().rebuildBusy) {
      rebuildBusy = false
      clearBuildState()
    }
  } catch {
    // 状态接口失败时保留上次成功结果，避免刷新后误报
    if (lastAgentStatus) updateAgentBar({ ...lastAgentStatus, stale: true })
  }
}

async function refreshStatus() {
  try {
    const { data } = await api('/agent/status')
    lastAgentStatus = data
    updateAgentBar(data)
    if (activeSection === 'agent') {
      renderForm()
      autoProbeModelStatus()
    }
    return data
  } catch (err) {
    if (lastAgentStatus) {
      updateAgentBar({ ...lastAgentStatus, stale: true })
    } else {
      setPill($('#pill-agent'), 'Agent · 状态未知', 'warn')
      setPill($('#pill-index'), '索引 · 状态未知', 'warn')
    }
    throw err
  }
}

async function validateBeforeRebuild() {
  clearBuildUi()
  setBuildProgress('start', '正在校验 API Key / LLM / Embedding…', 2)
  const data = await fetchModelValidation()
  const message = data?.ok ? '校验通过' : '模型配置校验未通过'
  renderValidateChecks(data?.checks || [])
  if (!data?.ok) {
    const failed = (data?.checks || []).find((c) => !c.ok)
    const errMsg = failed?.message ? `${failed.label}：${failed.message}` : (message || '模型配置校验未通过')
    showBuildError(errMsg, { checks: data?.checks })
    throw new Error(errMsg)
  }
  setBuildProgress('start', '校验通过，准备构建…', 8)
  return data
}

function waitForBuildDone() {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    let sawBuilding = false
    const check = async () => {
      try {
        const { data } = await api('/agent/status')
        updateAgentBar(data)
        const manifest = data?.index?.manifest || {}
        const building = isIndexBuilding(data?.index || {}, manifest)
        if (building) sawBuilding = true
        if (manifest.status === 'ready' && sawBuilding) {
          stopStatusPoll()
          resolve(data)
          return
        }
        if (manifest.status === 'failed' && sawBuilding) {
          stopStatusPoll()
          const detail = manifest.last_error || '索引构建失败'
          showBuildError('索引构建失败', { detail })
          reject(new Error(detail))
          return
        }
        if (Date.now() - started > 600000) {
          stopStatusPoll()
          reject(new Error('构建超时，请查看 YoAgent 日志'))
          return
        }
        setTimeout(check, 2000)
      } catch (err) {
        stopStatusPoll()
        reject(err)
      }
    }
    check()
  })
}

async function rebuildIndex(scope, btn) {
  if (scope !== 'game') {
    showToast('群记忆索引由系统自动维护', 'ok')
    return
  }
  if (dirty) {
    showToast('请先保存配置，再重建索引', 'err')
    return
  }

  const scopeMeta = REBUILD_SCOPE_META.game
  activeRebuildScope = scope

  await withButtonLoading(btn, scopeMeta.btnLoading, async () => {
    rebuildBusy = true
    saveBuildState()
    try {
      setBuildScopeHint(scope)
      await validateBeforeRebuild()
      const { message, data } = await api('/index/rebuild', {
        method: 'POST',
        body: JSON.stringify({ scope }),
      })
      if (data?.started === false) {
        const checks = data?.validation?.checks || []
        renderValidateChecks(checks)
        const failed = checks.find((c) => !c.ok)
        const errMsg = failed
          ? `${failed.label}：${failed.message || message || '未通过'}`
          : (message || '模型配置校验未通过')
        showBuildError(errMsg, { checks })
        throw new Error(errMsg)
      }
      showToast(message || `已开始重建${scopeMeta.label}`)
      setBuildProgress('start', `已开始重建${scopeMeta.label}…`, 10)
      setBuildScopeHint(scope)
      await waitForBuildDone()
      const counts = (await refreshStatus())?.index?.scope_counts || {}
      const stats = formatIndexCounts(counts)
      const doneMsg = `${scopeMeta.label}构建完成：${stats.summary(scope)}`
      showBuildSuccess(doneMsg)
      showToast(doneMsg, 'ok', 8000)
    } catch (err) {
      const msg = err.message || String(err)
      if (!buildErrorSticky) {
        showBuildError(msg)
      }
      showToast(msg, 'err')
    } finally {
      rebuildBusy = false
      activeRebuildScope = null
      saveBuildState()
      await refreshStatus()
    }
  })
}

async function loadMeta() {
  const { data } = await api('/meta')
  meta = data
  draft = structuredClone(data.config || {})
  ensureProfiles()
  loadModelStatusCache(draft)
  const brandSub = $('#brand-sub')
  if (brandSub && data.plugin?.subtitle) brandSub.textContent = data.plugin.subtitle

  activeSection = sectionFromPath()
  if (!location.pathname.match(/\/yoyo\/(basic|fun|agent)$/)) {
    navigateToSection(activeSection, { replace: true })
  } else {
    renderNav()
    renderForm()
  }

  await resumeIndexBuildUi()
  if (!statusPollTimer) {
    await refreshStatus().catch(() => {})
  } else if (activeSection === 'agent') {
    autoProbeModelStatus()
  }
}

window.addEventListener('popstate', () => {
  activeSection = sectionFromPath()
  renderNav()
  renderForm()
  updateBuildBanner()
})

$('#build-banner-go')?.addEventListener('click', (e) => {
  e.preventDefault()
  navigateToSection('agent')
})

async function saveConfig() {
  $('#btn-save').disabled = true
  try {
    ensureProfiles()
    const { message, data } = await api('/config', {
      method: 'POST',
      body: JSON.stringify({ config: draft }),
    })
    draft = structuredClone(data.config || {})
    ensureProfiles()
    setDirty(false)
    clearModelStatusCache()
    modelStatusState.loadingTargets = new Set()
    renderNav()
    renderForm()
    await refreshStatus()
    const extra = data.restarted ? '（YoAgent 已重启）' : (data.restartError ? `（重启失败：${data.restartError}）` : '')
    showToast(`${message}${extra}`)
  } catch (err) {
    showToast(err.message, 'err')
  } finally {
    $('#btn-save').disabled = false
  }
}

$('#btn-save').addEventListener('click', saveConfig)
$('#btn-restart').addEventListener('click', async () => {
  const btn = $('#btn-restart')
  const starting = btn?.dataset.agentRunning !== '1'
  await withButtonLoading(btn, starting ? '启动中…' : '重启中…', async () => {
    try {
      const { message, data } = await api('/agent/restart', { method: 'POST', body: '{}' })
      await refreshStatus()
      showToast(message, data?.running ? 'ok' : 'err', 6000)
    } catch (err) {
      showToast(err.message, 'err', 6000)
    }
  })
})
$('#btn-rebuild-game').addEventListener('click', () => rebuildIndex('game', $('#btn-rebuild-game')))

window.addEventListener('beforeunload', (e) => {
  if (dirty) {
    e.preventDefault()
    e.returnValue = ''
  }
})

function renderLoginGate(message) {
  $('#section-eyebrow').textContent = 'YoAgent 配置中心'
  $('#section-title').innerHTML = '<span class="title-accent">需要登录</span>'
  $('#section-desc').textContent = message || '请向 Bot 发送 #悠悠登录 获取带令牌的登录链接'
  $('#agent-bar').classList.add('hidden')
  nav.innerHTML = ''
  form.innerHTML = `
    <section class="group-card card login-card">
      <div class="group-head"><h3 class="group-title">如何进入</h3></div>
      <ol class="login-steps">
        <li>在 QQ 向 Bot 发送 <strong>#悠悠登录</strong>（仅主人）</li>
        <li>打开私信里的完整链接（含 <code>?token=</code>）</li>
        <li>令牌 24 小时内有效，过期请重新获取</li>
      </ol>
      <p class="muted login-note">直接打开 <code>/yoyo/</code> 无法使用，必须使用登录链接（打开后会进入 <code>/yoyo/basic</code> 等页面）。</p>
    </section>
  `
  $('#btn-save').disabled = true
  $('#save-hint').textContent = '未登录'
}

function renderLoadError(message) {
  $('#section-eyebrow').textContent = 'YoAgent 配置中心'
  $('#section-title').innerHTML = '<span class="title-accent">加载失败</span>'
  $('#section-desc').textContent = message || '无法加载配置，请刷新或重新 #悠悠登录'
  $('#agent-bar').classList.add('hidden')
  nav.innerHTML = ''
  form.innerHTML = `
    <section class="group-card card login-card">
      <p class="muted empty-tip">${escapeHtml(message || '加载失败')}</p>
      <p class="muted login-note">若持续失败，请重启 Yunzai 后重新发送 <strong>#悠悠登录</strong> 打开链接。</p>
    </section>
  `
  $('#btn-save').disabled = true
  $('#save-hint').textContent = '无法编辑'
}

loadMeta().catch((err) => {
  const msg = err.message || String(err)
  if (/登录|令牌|401|未登录/i.test(msg)) {
    renderLoginGate(msg)
  } else {
    renderLoadError(msg)
    showToast(msg, 'err')
  }
})
