import os from 'os'
import cfg from '../../../lib/config/config.js'

const REMOTE_IP_CACHE_KEY = 'yoyo:panel:remote-ips'
const REMOTE_IP_TTL = 86400

function isLoopbackHost(hostname) {
  const h = String(hostname || '').toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '::1'
}

function normalizeBase(urlOrHost, port) {
  let base = String(urlOrHost || '').trim()
  if (!base) return null
  if (!/^https?:\/\//i.test(base)) base = `http://${base}`
  base = base.replace(/\/$/, '')
  try {
    const u = new URL(base)
    if (!u.port && port) {
      return `${u.protocol}//${u.hostname}:${port}`
    }
    return `${u.protocol}//${u.host}`
  } catch {
    return null
  }
}

/** 本机可用 IP（参考锅巴 getLocalIps） */
export function getLocalIps(port) {
  const ips = []
  const portSuffix = port ? `:${port}` : ''
  try {
    const networks = os.networkInterfaces()
    for (const [name, wlans] of Object.entries(networks)) {
      if (!wlans) continue
      for (const wlan of wlans) {
        if (name === 'lo' || name === 'docker0') continue
        if (wlan.address.slice(0, 2) === 'fe' || wlan.address.slice(0, 2) === 'fc') continue
        if (['127.0.0.1', '::1'].includes(wlan.address)) continue
        if (wlan.family === 'IPv6') {
          ips.push(`[${wlan.address}]${portSuffix}`)
        } else {
          ips.push(`${wlan.address}${portSuffix}`)
        }
      }
    }
  } catch (err) {
    logger?.debug?.(`[yoyo-plugin] 获取本机 IP 失败: ${err.message}`)
  }
  if (!ips.length) ips.push(`127.0.0.1${portSuffix}`)
  return ips
}

async function fetchRemoteIps() {
  try {
    const cached = await redis.get(REMOTE_IP_CACHE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached)
      if (Array.isArray(parsed) && parsed.length) return parsed
    }
  } catch {}

  const ips = []
  try {
    const res = await fetch('http://v4.ip.zxinc.org/info.php?type=json', {
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const body = await res.json()
      if (body?.code === 0 && body?.data?.myip) ips.push(body.data.myip)
    }
  } catch {}

  if (ips.length) {
    try {
      await redis.set(REMOTE_IP_CACHE_KEY, JSON.stringify(ips), { EX: REMOTE_IP_TTL })
    } catch {}
  }
  return ips
}

function joinRemoteIp(ip, port) {
  if (/^https?:\/\//i.test(ip)) return ip.replace(/\/$/, '')
  if (ip.includes(':') && !ip.startsWith('[')) {
    return `http://[${ip}]${port ? `:${port}` : ''}`
  }
  return `http://${ip}${port ? `:${port}` : ''}`
}

/** 解析面板基址：自定义 > 外网 > 内网 > 配置/回环 */
export async function resolvePanelBaseUrls() {
  const server = cfg?.server || {}
  const port = Number(server.port) || 2536

  const custom = []
  const local = []
  const remote = []

  const configured = normalizeBase(server.url, port)
  if (configured && !isLoopbackHost(new URL(configured).hostname)) {
    custom.push(configured)
  }
  if (server.https?.url) {
    const httpsBase = normalizeBase(server.https.url, server.https.port || port)
    if (httpsBase && !isLoopbackHost(new URL(httpsBase).hostname)) {
      custom.push(httpsBase)
    }
  }

  for (const ip of getLocalIps(port)) {
    local.push(`http://${ip}`.replace('http://http://', 'http://'))
  }

  for (const ip of await fetchRemoteIps()) {
    remote.push(joinRemoteIp(ip, port))
  }

  const all = []
  const seen = new Set()
  for (const list of [custom, remote, local]) {
    for (const base of list) {
      if (!base || seen.has(base)) continue
      seen.add(base)
      all.push(base)
    }
  }

  if (!all.length) {
    all.push(configured || `http://127.0.0.1:${port}`)
  }

  return { custom, local, remote, all }
}

/** Yunzai HTTP 上的 yoyo 配置面板地址（同步，不含外网探测） */
export function getYoyoPanelUrl() {
  const server = cfg?.server || {}
  const port = Number(server.port) || 2536
  const configured = normalizeBase(server.url, port)

  if (configured && !isLoopbackHost(new URL(configured).hostname)) {
    return `${configured}/yoyo/basic`
  }

  const local = getLocalIps(port).map((ip) => `http://${ip}`)
  if (local.length) return `${local[0]}/yoyo/basic`

  return `${configured || `http://127.0.0.1:${port}`}/yoyo/basic`
}

/** #悠悠登录：生成带 token 的地址列表文案 */
export async function buildPanelLoginUrlLines(token) {
  const { custom, local, remote, all } = await resolvePanelBaseUrls()
  const suffix = `?token=${encodeURIComponent(token)}`
  const lines = []

  const pushSection = (title, bases) => {
    if (!bases?.length) return
    lines.push(`${title}：`)
    for (const base of bases) {
      lines.push(`${base.replace(/\/$/, '')}/yoyo/basic${suffix}`)
    }
  }

  pushSection('自定义地址', custom)
  pushSection('外网地址', remote)
  pushSection('内网地址', local)

  if (!lines.length) {
    lines.push('登录地址：')
    lines.push(`${all[0].replace(/\/$/, '')}/yoyo/basic${suffix}`)
  }

  return lines
}
