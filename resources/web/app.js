const API = '/yoyo/api'
const VALID_SECTIONS = new Set(['basic', 'fun', 'chat'])
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
  return draft[field.key]
}

function writeFieldValue(field, value) {
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

function renderGroupHead(group) {
  return `<div class="group-head"><h3>${escapeHtml(group.label)}</h3></div>`
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
      <div class="field-head">
        <label>${escapeHtml(field.label)}</label>
      </div>
      ${control}
      ${field.help ? `<div class="help">${escapeHtml(field.help)}</div>` : ''}
    </div>
  `
}

function renderGroupCard(group) {
  const fieldsHtml = group.fields.map(renderField).join('')
  const title = group.label ? renderGroupHead(group) : ''
  return `
    <section class="group-card card">
      ${title}
      <div class="form-grid">${fieldsHtml}</div>
    </section>
  `
}

function updateSectionHero(section) {
  $('#section-eyebrow').textContent = 'config/config.yaml'
  $('#section-title').innerHTML = `<span class="title-accent">${escapeHtml(section?.label || activeSection)}</span>`
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
  bindFormEvents()
}

function findFieldById(id) {
  return meta.fields.find((f) => fieldId(f) === id)
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

  form.querySelectorAll('select, input[type="text"], input[type="number"], input[type="password"]').forEach((el) => {
    if (el.dataset.tagInput) return
    el.addEventListener('change', () => {
      const field = findFieldById(el.dataset.fieldId)
      if (!field) return
      let value = el.value
      if (field.type === 'number') value = value === '' ? '' : Number(value)
      writeFieldValue(field, value)
      setDirty(true)
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
      const list = Array.isArray(readFieldValue(field)) ? [...readFieldValue(field)] : []
      list.push(text)
      writeFieldValue(field, list)
      input.value = ''
      setDirty(true)
      renderForm()
    })
  })

  form.querySelectorAll('.tag button[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const wrap = btn.closest('.tags')
      const field = findFieldById(wrap?.dataset.fieldId)
      if (!field) return
      const idx = Number(btn.dataset.remove)
      const list = Array.isArray(readFieldValue(field)) ? [...readFieldValue(field)] : []
      list.splice(idx, 1)
      writeFieldValue(field, list)
      setDirty(true)
      renderForm()
    })
  })
}

function sectionFromPath() {
  const m = location.pathname.match(/\/yoyo\/(basic|fun|chat)\/?$/)
  return m?.[1] || DEFAULT_SECTION
}

function navigateToSection(id) {
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
  $('#section-eyebrow').textContent = '配置中心'
  $('#section-title').innerHTML = '<span class="title-accent">需要登录</span>'
  $('#section-desc').textContent = message || '请向 Bot 发送 #悠悠登录 获取带令牌的地址'
  form.innerHTML = `
    <div class="card login-card">
      <p>直接打开 <code>/yoyo/</code> 无法使用，必须使用登录链接（打开后会进入 <code>/yoyo/basic</code> 等页面）。</p>
      <p class="muted login-note">群内发送 <code>#悠悠登录</code>，按私信中的链接打开即可。</p>
    </div>
  `
  nav.innerHTML = ''
  $('#btn-save').disabled = true
}

async function boot() {
  activeSection = sectionFromPath()
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
