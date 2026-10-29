const API = '/yoyo/api'
const VALID_SECTIONS = new Set(['basic', 'chat'])
const DEFAULT_SECTION = 'basic'

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

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;')
}

function fieldVisible(field, config) {
  if (!field.showWhen) return true
  return Object.entries(field.showWhen).every(([k, v]) => config[k] === v)
}

function fieldId(field) {
  return field.key
}

function readFieldValue(field) {
  const v = draft[field.key]
  if (field.type === 'json') {
    if (v && typeof v === 'object') {
      try {
        return JSON.stringify(v, null, 2)
      } catch {
        return '{}'
      }
    }
    return typeof v === 'string' ? v : '{}'
  }
  return v
}

function writeFieldValue(field, value) {
  if (field.type === 'json') {
    const s = String(value ?? '').trim()
    if (!s) {
      draft[field.key] = {}
      return
    }
    try {
      const parsed = JSON.parse(s)
      draft[field.key] = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      draft[field.key] = s
    }
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
      const item = { id, label: field.groupLabel || '', fields: [] }
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

/** @type {Map<string, string>} group_id -> group_name */
const groupNameMap = new Map()
let groupCatalog = null
let groupPickerFieldId = ''
/** @type {Set<string>} */
let groupPickerSelected = new Set()

function formatGroupTag(id) {
  const name = groupNameMap.get(String(id))
  if (name && name !== String(id)) return `${name} · ${id}`
  return String(id)
}

function renderTagsList(values, { asGroups = false } = {}) {
  return values.map((v, i) => {
    const label = asGroups ? formatGroupTag(v) : String(v)
    return `<span class="tag">${escapeHtml(label)}<button type="button" data-remove="${i}" aria-label="移除">×</button></span>`
  }).join('')
}

function renderTags(field, val) {
  const values = Array.isArray(val) ? val : []
  const id = fieldId(field)
  return `
    <div class="tags" data-field-id="${id}">
      ${renderTagsList(values)}
    </div>
    <div class="tag-input-row">
      <input type="text" placeholder="输入后回车添加" data-tag-input="${id}" />
    </div>
  `
}

function renderGroups(field, val) {
  const values = Array.isArray(val) ? val.map(String) : []
  const id = fieldId(field)
  return `
    <div class="tags" data-field-id="${id}" data-kind="groups">
      ${renderTagsList(values, { asGroups: true })}
    </div>
    <div class="tag-input-row group-picker-row">
      <button type="button" class="btn btn-ghost btn-pick-group" data-pick-groups="${id}">选择群聊</button>
      <input type="text" placeholder="也可手动输入群号回车" data-tag-input="${id}" data-groups-input="1" />
    </div>
  `
}

function refreshTagsDom(fieldId) {
  const wrap = form.querySelector(`.tags[data-field-id="${fieldId}"]`)
  if (!wrap) return
  const field = findFieldById(fieldId)
  if (!field) return
  const values = Array.isArray(readFieldValue(field)) ? readFieldValue(field).map(String) : []
  const asGroups = field.type === 'groups' || wrap.dataset.kind === 'groups'
  wrap.innerHTML = renderTagsList(values, { asGroups })
  bindTagRemoveButtons(wrap)
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
    case 'groups':
      return renderGroups(field, val)
    case 'select':
      return renderSelect(field, val)
    case 'number':
      return `<input type="number" data-field-id="${id}" value="${escapeAttr(val ?? '')}" min="${field.min ?? ''}" max="${field.max ?? ''}" />`
    case 'password':
      return `
        <div class="secret-input">
          <input type="password" data-field-id="${id}" value="${escapeAttr(val ?? '')}" autocomplete="off" />
          <button type="button" class="secret-toggle" data-secret-toggle aria-label="显示密钥" title="显示 / 隐藏">显示</button>
        </div>
      `
    case 'json':
      return `<textarea data-field-id="${id}" rows="6" spellcheck="false" class="json-input">${escapeHtml(val ?? '{}')}</textarea>`
    default:
      return `<input type="text" data-field-id="${id}" value="${escapeAttr(val ?? '')}" />`
  }
}

function renderGroupHead(group) {
  return `<div class="group-head"><h3>${escapeHtml(group.label)}</h3></div>`
}

function renderSubgroupHead(label) {
  return `<div class="subgroup-head"><h4>${escapeHtml(label)}</h4></div>`
}

function renderField(field) {
  const isRow = field.layout === 'row' || field.type === 'switch'
  const spanClass = field.span === 3 || field.span === 'full' ? 'span-full' : field.span === 2 ? 'span-2' : ''
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
      <div class="field-head">
        <label>${escapeHtml(field.label)}</label>
      </div>
      ${control}
      ${field.help ? `<div class="help">${escapeHtml(field.help)}</div>` : ''}
    </div>
  `
}

function renderGroupCard(group) {
  const title = group.label ? renderGroupHead(group) : ''
  const chunks = []
  let lastSub = null
  let buf = []
  const flush = () => {
    if (!buf.length) return
    chunks.push(`<div class="form-grid">${buf.join('')}</div>`)
    buf = []
  }
  for (const field of group.fields) {
    const sub = field.subgroup || ''
    const subLabel = field.subgroupLabel || ''
    if (sub !== lastSub) {
      flush()
      if (subLabel) chunks.push(renderSubgroupHead(subLabel))
      lastSub = sub
    }
    buf.push(renderField(field))
  }
  flush()
  return `
    <section class="group-card">
      ${title}
      ${chunks.join('')}
    </section>
  `
}

function updateSectionHero(section) {
  $('#section-eyebrow').textContent = 'config/config.yaml'
  $('#section-title').textContent = section?.label || activeSection
  $('#section-desc').textContent = section?.desc || '修改写入 config/config.yaml'
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

  form.innerHTML = groupedFields(fields).map((group) => renderGroupCard(group)).join('')
  if (activeSection === 'chat' && fields.some((f) => f.subgroup === 'tts')) {
    const modelsCard = form.querySelector('.group-card')
    // 挂在「模型配置」卡片末尾：默认参考音色上传
    const cards = [...form.querySelectorAll('.group-card')]
    const models = cards.find((c) => c.textContent?.includes('模型配置')) || cards[0]
    if (models) {
      models.insertAdjacentHTML('beforeend', renderTtsVoiceCardInner())
      bindTtsVoiceCard()
    }
  }
  bindFormEvents()
}

function renderTtsVoiceCardInner() {
  return `
      <div class="subgroup-head"><h4>默认参考音色</h4></div>
      <div class="form-grid" id="tts-voice-card">
        <div class="field span-full">
          <div class="help">上传 3–15 秒清晰人声（wav/mp3）可同步克隆；仅限本人或已授权声音。试听不发到群。</div>
          <div id="tts-voice-status" class="help">读取中…</div>
        </div>
        <div class="field span-2">
          <div class="field-head"><label>参考音频</label></div>
          <input type="file" id="tts-voice-file" accept="audio/*,.wav,.mp3,.m4a,.ogg" />
        </div>
        <div class="field span-2">
          <div class="field-head"><label>参考文本（可选）</label></div>
          <input type="text" id="tts-voice-prompt" placeholder="音频里说的那句话" />
        </div>
        <div class="field span-full" style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn" id="tts-voice-upload">上传并保存</button>
          <button type="button" class="btn" id="tts-voice-preview">试听</button>
          <button type="button" class="btn" id="tts-voice-clear">清除</button>
        </div>
        <audio id="tts-voice-player" controls class="span-full" style="width:100%;display:none"></audio>
      </div>
  `
}

async function refreshTtsVoiceStatus() {
  const el = $('#tts-voice-status')
  if (!el) return
  try {
    const { data } = await api('/tts/voice')
    if (data.exists) {
      el.textContent = `已上传：${data.filename || 'default.wav'}（${data.bytes || 0} bytes）${data.prompt_text ? `｜参考：「${data.prompt_text}」` : ''}`
      const prompt = $('#tts-voice-prompt')
      if (prompt && data.prompt_text && !prompt.value) prompt.value = data.prompt_text
    } else {
      el.textContent = '尚未上传默认音色（仍可用配置里的 Voice id 预设）'
    }
  } catch (err) {
    el.textContent = err.message || '读取失败'
  }
}

function bindTtsVoiceCard() {
  refreshTtsVoiceStatus()
  $('#tts-voice-upload')?.addEventListener('click', async () => {
    const file = $('#tts-voice-file')?.files?.[0]
    if (!file) return alert('请先选择音频文件')
    const prompt_text = $('#tts-voice-prompt')?.value || ''
    const buf = await file.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const audio_base64 = btoa(binary)
    try {
      await api('/tts/voice', {
        method: 'POST',
        body: JSON.stringify({ audio_base64, filename: file.name, prompt_text }),
      })
      await refreshTtsVoiceStatus()
      alert('音色已保存')
    } catch (err) {
      alert(err.message || '上传失败')
    }
  })
  $('#tts-voice-clear')?.addEventListener('click', async () => {
    if (!confirm('清除全局默认参考音色？')) return
    try {
      await api('/tts/voice', { method: 'DELETE' })
      await refreshTtsVoiceStatus()
    } catch (err) {
      alert(err.message || '清除失败')
    }
  })
  $('#tts-voice-preview')?.addEventListener('click', async () => {
    const player = $('#tts-voice-player')
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (panelToken) headers['X-Yoyo-Token'] = panelToken
      const res = await fetch(`${API}/tts/preview`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: '你好，我是悠悠。' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || `试听失败 (${res.status})`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      if (player) {
        player.src = url
        player.style.display = 'block'
        player.play().catch(() => {})
      }
    } catch (err) {
      alert(err.message || '试听失败')
    }
  })
}

function findFieldById(id) {
  return meta.fields.find((f) => fieldId(f) === id)
}

function bindTagRemoveButtons(scope = form) {
  scope.querySelectorAll('.tag button[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const wrap = btn.closest('.tags')
      const field = findFieldById(wrap?.dataset.fieldId)
      if (!field) return
      const idx = Number(btn.dataset.remove)
      const list = Array.isArray(readFieldValue(field)) ? [...readFieldValue(field)] : []
      list.splice(idx, 1)
      writeFieldValue(field, list)
      setDirty(true)
      refreshTagsDom(fieldId(field))
    })
  })
}

function bindFormEvents() {
  form.querySelectorAll('.switch').forEach((el) => {
    const toggle = () => {
      const field = findFieldById(el.dataset.fieldId)
      if (!field) return
      const next = !readFieldValue(field)
      writeFieldValue(field, next)
      el.classList.toggle('on', next)
      el.setAttribute('aria-checked', String(next))
      setDirty(true)
    }
    el.addEventListener('click', toggle)
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        toggle()
      }
    })
  })

  form.querySelectorAll('select, input[type="text"], input[type="number"], input[type="password"], textarea').forEach((el) => {
    if (el.dataset.tagInput) return
    const sync = () => {
      const field = findFieldById(el.dataset.fieldId)
      if (!field) return
      let value = el.value
      if (field.type === 'number') value = value === '' ? '' : Number(value)
      writeFieldValue(field, value)
      setDirty(true)
    }
    el.addEventListener('change', sync)
    el.addEventListener('input', sync)
  })

  form.querySelectorAll('[data-secret-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement?.querySelector('input')
      if (!input) return
      const show = input.type === 'password'
      input.type = show ? 'text' : 'password'
      btn.textContent = show ? '隐藏' : '显示'
      btn.setAttribute('aria-label', show ? '隐藏密钥' : '显示密钥')
    })
  })

  form.querySelectorAll('[data-tag-input]').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      const id = input.dataset.tagInput
      const field = findFieldById(id)
      if (!field) return
      const text = input.value.trim()
      if (!text) return
      const list = Array.isArray(readFieldValue(field)) ? [...readFieldValue(field)].map(String) : []
      if (list.includes(text)) {
        input.value = ''
        return
      }
      list.push(text)
      writeFieldValue(field, list)
      input.value = ''
      setDirty(true)
      refreshTagsDom(id)
    })
  })

  form.querySelectorAll('[data-pick-groups]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openGroupPicker(btn.dataset.pickGroups)
    })
  })

  bindTagRemoveButtons()
}

async function ensureGroupCatalog(force = false) {
  if (groupCatalog && !force) return groupCatalog
  const body = await api('/groups')
  const list = Array.isArray(body?.data?.groups) ? body.data.groups : []
  groupCatalog = list
  groupNameMap.clear()
  for (const g of list) {
    const id = String(g.group_id || '')
    if (!id) continue
    groupNameMap.set(id, String(g.group_name || id))
  }
  return groupCatalog
}

function renderGroupModalList(filter = '') {
  const listEl = $('#group-modal-list')
  const countEl = $('#group-modal-count')
  if (!listEl) return
  const q = filter.trim().toLowerCase()
  const rows = (groupCatalog || []).filter((g) => {
    if (!q) return true
    const id = String(g.group_id || '')
    const name = String(g.group_name || '')
    return id.includes(q) || name.toLowerCase().includes(q)
  })
  countEl.textContent = `已选 ${groupPickerSelected.size} / 显示 ${rows.length}`
  if (!rows.length) {
    listEl.innerHTML = '<p class="muted empty-tip">没有匹配的群，或 Bot 暂无群列表</p>'
    return
  }
  listEl.innerHTML = rows.map((g) => {
    const id = String(g.group_id)
    const checked = groupPickerSelected.has(id) ? 'checked' : ''
    return `
      <label class="group-option">
        <input type="checkbox" value="${escapeAttr(id)}" ${checked} />
        <span class="group-option-main">
          <span class="group-option-name">${escapeHtml(g.group_name || id)}</span>
          <span class="group-option-id">${escapeHtml(id)}</span>
        </span>
      </label>
    `
  }).join('')

  listEl.querySelectorAll('input[type="checkbox"]').forEach((box) => {
    box.addEventListener('change', () => {
      if (box.checked) groupPickerSelected.add(box.value)
      else groupPickerSelected.delete(box.value)
      countEl.textContent = `已选 ${groupPickerSelected.size} / 显示 ${rows.length}`
    })
  })
}

async function openGroupPicker(fieldId) {
  const field = findFieldById(fieldId)
  if (!field) return
  groupPickerFieldId = fieldId
  const cur = Array.isArray(readFieldValue(field)) ? readFieldValue(field).map(String) : []
  groupPickerSelected = new Set(cur)
  const modal = $('#group-modal')
  modal.classList.remove('hidden')
  modal.setAttribute('aria-hidden', 'false')
  $('#group-modal-search').value = ''
  $('#group-modal-list').innerHTML = '<p class="muted empty-tip">加载群列表…</p>'
  try {
    await ensureGroupCatalog(true)
    renderGroupModalList('')
    // 刷新已选 tag 上的群名
    form.querySelectorAll('.tags[data-kind="groups"]').forEach((wrap) => refreshTagsDom(wrap.dataset.fieldId))
  } catch (err) {
    $('#group-modal-list').innerHTML = `<p class="muted empty-tip">${escapeHtml(err.message || '加载失败')}</p>`
  }
  $('#group-modal-search').focus()
}

function closeGroupPicker() {
  const modal = $('#group-modal')
  modal.classList.add('hidden')
  modal.setAttribute('aria-hidden', 'true')
  groupPickerFieldId = ''
}

function confirmGroupPicker() {
  const field = findFieldById(groupPickerFieldId)
  if (!field) {
    closeGroupPicker()
    return
  }
  const list = [...groupPickerSelected]
  writeFieldValue(field, list)
  setDirty(true)
  refreshTagsDom(groupPickerFieldId)
  closeGroupPicker()
}

function initGroupModal() {
  const modal = $('#group-modal')
  if (!modal) return
  modal.querySelectorAll('[data-modal-close]').forEach((el) => {
    el.addEventListener('click', closeGroupPicker)
  })
  $('#group-modal-ok')?.addEventListener('click', confirmGroupPicker)
  $('#group-modal-search')?.addEventListener('input', (e) => {
    renderGroupModalList(e.target.value || '')
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeGroupPicker()
  })
}

function sectionFromPath() {
  const m = location.pathname.match(/\/yoyo\/(basic|fun|chat)\/?$/)
  const id = m?.[1] || DEFAULT_SECTION
  // 旧「娱乐功能」路由并入插件配置
  return id === 'fun' ? 'basic' : id
}

function navigateToSection(id) {
  if (id === 'fun') id = 'basic'
  if (!VALID_SECTIONS.has(id)) id = DEFAULT_SECTION
  activeSection = id
  const qs = location.search || ''
  history.pushState({}, '', `/yoyo/${id}${qs}`)
  renderNav()
  renderForm()
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  if (panelToken) headers['X-Yoyo-Token'] = panelToken
  const res = await fetch(`${API}${path}`, { ...opts, headers })
  const body = await res.json().catch(() => ({}))
  if (res.status === 401) {
    sessionStorage.removeItem('yoyo_panel_token')
    panelToken = ''
    throw new Error(body.message || '未登录或令牌已过期')
  }
  if (!res.ok || body.code !== 200) {
    throw new Error(body.message || `请求失败 (${res.status})`)
  }
  return body
}

function showLoginGate(message) {
  $('#section-eyebrow').textContent = 'YOYO PANEL'
  $('#section-title').textContent = '需要登录'
  $('#section-desc').textContent = message || '请向 Bot 发送 #悠悠登录 获取带令牌的地址'
  form.innerHTML = `
    <div class="login-card">
      <p>直接打开 <code>/yoyo/</code> 无法使用，必须使用登录链接（打开后会进入 <code>/yoyo/basic</code> 等页面）。</p>
      <p class="muted login-note">群内发送 <code>#悠悠登录</code>，按私信中的链接打开即可。</p>
    </div>
  `
  nav.innerHTML = ''
  $('#btn-save').disabled = true
}

async function boot() {
  activeSection = sectionFromPath()
  if (/\/yoyo\/fun\/?$/.test(location.pathname)) {
    history.replaceState({}, '', `/yoyo/basic${location.search || ''}`)
  }
  initGroupModal()
  if (!panelToken) {
    showLoginGate()
    return
  }
  try {
    const { data } = await api('/meta')
    meta = data
    draft = structuredClone(data.config || {})
    if (data.plugin?.subtitle) $('#brand-sub').textContent = data.plugin.subtitle
    renderNav()
    renderForm()
    setDirty(false)
    // 预取群名，用于标签展示（失败忽略）
    ensureGroupCatalog().then(() => {
      form.querySelectorAll('.tags[data-kind="groups"]').forEach((wrap) => refreshTagsDom(wrap.dataset.fieldId))
    }).catch(() => {})
  } catch (err) {
    showLoginGate(err.message)
  }
}

$('#btn-save').addEventListener('click', async () => {
  try {
    const { message } = await api('/config', {
      method: 'POST',
      body: JSON.stringify({ config: draft }),
    })
    setDirty(false)
    showToast(message || '保存成功')
  } catch (err) {
    showToast(err.message || '保存失败', 'err')
  }
})

window.addEventListener('popstate', () => {
  activeSection = sectionFromPath()
  if (meta) {
    renderNav()
    renderForm()
  }
})

boot()
