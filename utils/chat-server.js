import { execSync, spawn } from 'child_process'
import fs from 'fs'
import http from 'http'
import path from 'path'
import { getChatPort } from '../api/chat/schema.js'
import { resolveUvBin } from './uv.js'

function serverDir(pluginPath) {
  return path.join(pluginPath, 'server')
}

function pidFile(pluginPath) {
  return path.join(serverDir(pluginPath), '.yoagent.pid')
}

function venvUvicorn(pluginPath) {
  const name = process.platform === 'win32' ? 'uvicorn.exe' : 'uvicorn'
  const bin = path.join(serverDir(pluginPath), '.venv', 'bin', name)
  return fs.existsSync(bin) ? bin : null
}

export function isChatPortListening(port) {
  try {
    execSync(`ss -ltn | grep -q ':${port} '`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export function isChatServerRunning(cfg = {}) {
  return isChatPortListening(getChatPort(cfg))
}

function waitPort(port, timeoutMs = 20000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (isChatPortListening(port)) return resolve(true)
      if (Date.now() - start > timeoutMs) return reject(new Error(`等待端口 ${port} 超时`))
      setTimeout(tick, 400)
    }
    tick()
  })
}

export async function ensureChatServerRunning(pluginPath, config, uvBin) {
  if (isChatServerRunning(config)) return true
  if (!venvUvicorn(pluginPath)) return false
  try {
    await startChatServer(pluginPath, config, uvBin || resolveUvBin(pluginPath))
    return true
  } catch (err) {
    logger.warn(`[yoyo-plugin] Chat Brain 自动启动失败: ${err.message}`)
    return false
  }
}

export function stopChatServer(pluginPath, config) {
  const port = getChatPort(config)
  const pf = pidFile(pluginPath)
  if (fs.existsSync(pf)) {
    try {
      const pid = Number(fs.readFileSync(pf, 'utf8').trim())
      if (pid) process.kill(pid, 'SIGTERM')
    } catch {}
    try {
      fs.unlinkSync(pf)
    } catch {}
  }
  try {
    execSync(`fuser -k ${port}/tcp`, { stdio: 'ignore' })
  } catch {}
}

export async function startChatServer(pluginPath, config, uvBin) {
  const dir = serverDir(pluginPath)
  if (!fs.existsSync(dir)) {
    throw new Error('Chat Brain 未安装，请先发送 #安装悠悠')
  }
  const port = getChatPort(config)
  if (isChatPortListening(port)) {
    return 'already'
  }
  let uvicornBin = venvUvicorn(pluginPath)
  if (!uvicornBin) {
    const uv = uvBin || resolveUvBin(pluginPath)
    if (!uv) throw new Error('缺少 uv，无法安装依赖')
    execSync(`"${uv}" sync`, { cwd: dir, stdio: 'pipe', timeout: 600000 })
    uvicornBin = venvUvicorn(pluginPath)
  }
  if (!uvicornBin) throw new Error('uvicorn 未就绪')

  const logPath = path.join(dir, 'yoagent.log')
  const out = fs.openSync(logPath, 'a')
  const child = spawn(
    uvicornBin,
    ['src.main:app', '--host', '0.0.0.0', '--port', String(port)],
    {
      cwd: dir,
      detached: true,
      stdio: ['ignore', out, out],
      env: { ...process.env },
    },
  )
  child.unref()
  fs.writeFileSync(pidFile(pluginPath), String(child.pid))
  await waitPort(port)
  return 'started'
}

export async function restartChatServer(pluginPath, config, uvBin) {
  stopChatServer(pluginPath, config)
  await new Promise((r) => setTimeout(r, 800))
  await startChatServer(pluginPath, config, uvBin)
  return 'restarted'
}

export async function startOrRestartChatServer(pluginPath, config, uvBin) {
  if (isChatServerRunning(config)) {
    await restartChatServer(pluginPath, config, uvBin)
    return 'restarted'
  }
  await startChatServer(pluginPath, config, uvBin)
  return 'started'
}

/** 轻量探活（不抛） */
export function probeChatHealth(config) {
  return new Promise((resolve) => {
    const port = getChatPort(config)
    const req = http.get(
      { host: '127.0.0.1', port, path: '/api/health', timeout: 2000 },
      (res) => {
        res.resume()
        resolve(res.statusCode === 200)
      },
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}
