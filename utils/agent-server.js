import { execSync, spawn } from 'child_process'
import fs from 'fs'
import http from 'http'
import path from 'path'
import { getAgentPort } from '../api/agent/schema.js'
import { resolveUvBin } from './uv.js'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const UV_PYTHON_MIRROR = 'https://mirrors.ustc.edu.cn/github-release/astral-sh/python-build-standalone/'
const RESTART_STOP_TIMEOUT_MS = 45000
const START_READY_TIMEOUT_MS = 30000

function agentUvEnv() {
  return { ...process.env, UV_PYTHON_INSTALL_MIRROR: UV_PYTHON_MIRROR }
}

function agentServerDir(pluginPath) {
  return path.join(pluginPath, 'server')
}

function agentPidFile(pluginPath) {
  return path.join(agentServerDir(pluginPath), '.yoagent.pid')
}

function agentVenvUvicorn(pluginPath) {
  const name = process.platform === 'win32' ? 'uvicorn.exe' : 'uvicorn'
  const bin = path.join(agentServerDir(pluginPath), '.venv', 'bin', name)
  return fs.existsSync(bin) ? bin : null
}

export function isAgentPortListening(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: 'pipe' })
      return /LISTENING/.test(out)
    }
    const out = execSync(`ss -ltn sport = :${port}`, { encoding: 'utf8', stdio: 'pipe' })
    return out.split('\n').slice(1).some((line) => line.trim().length > 0)
  } catch {
    try {
      const out = execSync(`lsof -iTCP:${port} -sTCP:LISTEN 2>/dev/null`, { encoding: 'utf8', stdio: 'pipe' }).trim()
      return !!out
    } catch {
      return false
    }
  }
}

function probeAgentHealthSync(port) {
  try {
    const out = execSync(
      `curl -sf --max-time 2 http://127.0.0.1:${port}/api/health`,
      { encoding: 'utf8', stdio: 'pipe' },
    )
    return JSON.parse(out)?.status === 'ok'
  } catch {
    return false
  }
}

function probeAgentHealth(port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/api/health', timeout: timeoutMs },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => {
          try {
            resolve(res.statusCode === 200 && JSON.parse(body)?.status === 'ok')
          } catch {
            resolve(false)
          }
        })
      },
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

function isProcessAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function pidsOnPort(port) {
  try {
    const out = execSync(`lsof -t -iTCP:${port} -sTCP:LISTEN 2>/dev/null`, { encoding: 'utf8', stdio: 'pipe' }).trim()
    return out ? out.split('\n').map((s) => Number.parseInt(s.trim(), 10)).filter(Boolean) : []
  } catch {
    return []
  }
}

function pidListeningOnPort(port) {
  const pids = pidsOnPort(port)
  return pids.length ? pids[0] : null
}

function forceKillPort(port) {
  for (const pid of pidsOnPort(port)) {
    try { process.kill(pid, 'SIGKILL') } catch {}
  }
  try {
    execSync(`fuser -k ${port}/tcp 2>/dev/null`, { shell: '/bin/sh', stdio: 'pipe' })
  } catch {}
}

async function waitForAgentDown(port, { timeoutMs = 8000, intervalMs = 400 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const up = (await probeAgentHealth(port)) || isAgentPortListening(port)
    if (!up) return true
    await sleep(intervalMs)
  }
  return !(await probeAgentHealth(port)) && !isAgentPortListening(port)
}

async function waitForAgentReady(port, expectedPid, { timeoutMs = START_READY_TIMEOUT_MS, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isProcessAlive(expectedPid)) return false
    const owner = pidListeningOnPort(port)
    if (owner === expectedPid && (await probeAgentHealth(port))) return true
    await sleep(intervalMs)
  }
  return false
}

export function isAgentServerRunning(config) {
  const port = getAgentPort(config)
  return probeAgentHealthSync(port) || isAgentPortListening(port)
}

function collectAgentPids(pluginPath, port) {
  const pids = new Set(pidsOnPort(port))
  const pf = agentPidFile(pluginPath)
  if (fs.existsSync(pf)) {
    const pid = Number.parseInt(fs.readFileSync(pf, 'utf8').trim(), 10)
    if (pid) pids.add(pid)
  }
  return pids
}

function signalUvicornStop(pluginPath) {
  const serverDir = agentServerDir(pluginPath)
  try {
    execSync(`pkill -f "${serverDir}/.venv/bin/uvicorn src.main:app"`, { stdio: 'pipe' })
  } catch {}
  try {
    execSync('pkill -f "uv run uvicorn src.main:app"', { stdio: 'pipe' })
  } catch {}
}

/** 重启用：先 SIGTERM，等连接释放；超时再强杀端口占用。 */
export async function stopAgentServerAsync(pluginPath, config, { timeoutMs = RESTART_STOP_TIMEOUT_MS } = {}) {
  const port = getAgentPort(config)
  const pf = agentPidFile(pluginPath)
  if (fs.existsSync(pf)) fs.unlinkSync(pf)

  for (const pid of collectAgentPids(pluginPath, port)) {
    try { process.kill(pid, 'SIGTERM') } catch {}
  }
  signalUvicornStop(pluginPath)

  if (await waitForAgentDown(port, { timeoutMs, intervalMs: 500 })) return

  forceKillPort(port)
  if (!(await waitForAgentDown(port, { timeoutMs: 10000, intervalMs: 300 }))) {
    throw new Error(
      `YoAgent 停止超时（端口 ${port} 仍有服务在跑，可能有未结束的聊天请求；请稍后再试 #重启悠悠）`,
    )
  }
}

/** 立即停止（#停止悠悠）：不等待长连接，直接清端口。 */
export function stopAgentServer(pluginPath, config) {
  const port = getAgentPort(config)
  const pf = agentPidFile(pluginPath)
  if (fs.existsSync(pf)) fs.unlinkSync(pf)

  for (const pid of collectAgentPids(pluginPath, port)) {
    try { process.kill(pid, 'SIGTERM') } catch {}
  }
  signalUvicornStop(pluginPath)

  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if (!isAgentPortListening(port) && !probeAgentHealthSync(port)) return
    try { execSync('sleep 0.2', { stdio: 'pipe' }) } catch {}
  }
  forceKillPort(port)
}

export async function startAgentServer(pluginPath, config, uvBin) {
  const port = getAgentPort(config)
  if (isAgentServerRunning(config)) {
    throw new Error(`端口 ${port} 已被占用，请先发送 #停止悠悠 或 #重启悠悠`)
  }
  const dir = agentServerDir(pluginPath)
  if (!fs.existsSync(dir)) {
    throw new Error('YoAgent 未安装，请先发送 #安装悠悠')
  }
  if (!agentVenvUvicorn(pluginPath)) {
    if (!uvBin) throw new Error('未检测到 uv，请先发送 #安装悠悠')
    execSync(`"${uvBin}" sync`, { cwd: dir, stdio: 'pipe', env: agentUvEnv(), timeout: 600000 })
  }
  const uvicornBin = agentVenvUvicorn(pluginPath)
  if (!uvicornBin) throw new Error('依赖安装失败，请重试 #安装悠悠')

  const logPath = path.join(dir, 'yoagent.log')
  const out = fs.openSync(logPath, 'a')
  const child = spawn(uvicornBin, [
    'src.main:app',
    '--host', '0.0.0.0',
    '--port', String(port),
  ], {
    cwd: dir,
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env },
  })
  child.unref()
  const pid = child.pid
  fs.writeFileSync(agentPidFile(pluginPath), String(pid))

  if (!(await waitForAgentReady(port, pid))) {
    if (isProcessAlive(pid)) {
      try { process.kill(pid, 'SIGTERM') } catch {}
    }
    try { fs.unlinkSync(agentPidFile(pluginPath)) } catch {}
    const log = tailAgentLog(logPath, 800)
    const alive = isProcessAlive(pid)
    const owner = pidListeningOnPort(port)
    throw new Error(
      `YoAgent 启动超时（新进程 pid=${pid}${alive ? '' : ' 已退出'}，端口监听 pid=${owner ?? '无'}）。`
      + `请查看 server/yoagent.log\n${log}`,
    )
  }
  return true
}

function tailAgentLog(logPath, maxChars = 800) {
  if (!fs.existsSync(logPath)) return ''
  const text = fs.readFileSync(logPath, 'utf8')
  const tail = text.slice(-maxChars)
  const errLines = tail.split('\n').filter((line) =>
    /ERROR|Error|Traceback|address already in use|Started server process|Application startup complete|Uvicorn running/i.test(line)
    && !/\[成功\]|\[分析\]|\[去重统计\]|\[警告\]/i.test(line),
  )
  if (errLines.length) return errLines.slice(-8).join('\n')
  return tail.split('\n').filter((line) => !/\[成功\]|\[分析\]|\[去重统计\]/i.test(line)).slice(-6).join('\n')
}

export async function restartAgentServer(pluginPath, config, uvBin) {
  await stopAgentServerAsync(pluginPath, config)
  await startAgentServer(pluginPath, config, uvBin)
}

export async function ensureAgentServerIfEnabled(pluginPath, config) {
  if (!config?.agentEnabled) return
  const dir = agentServerDir(pluginPath)
  if (!fs.existsSync(dir)) return
  const port = getAgentPort(config)
  if (isAgentServerRunning(config)) {
    logger.info(`[悠悠] YoAgent 已在运行（端口 ${port}）`)
    return
  }
  try {
    const uvBin = resolveUvBin(pluginPath)
    await startAgentServer(pluginPath, config, uvBin)
    logger.info(`[悠悠] YoAgent 已自动启动（端口 ${port}）`)
  } catch (err) {
    logger.error(`[悠悠] 自动启动失败：${err.message}`)
  }
}
