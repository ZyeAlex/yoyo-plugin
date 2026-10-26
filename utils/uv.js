import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

export function resolveUvBin(pluginPath) {
  const local = path.join(pluginPath, 'bin', 'uv')
  if (fs.existsSync(local)) return local
  try {
    const which = execSync('command -v uv', { encoding: 'utf8' }).trim()
    if (which) return which
  } catch {}
  return null
}

export async function ensureUv(pluginPath, autoInstall = false) {
  const existing = resolveUvBin(pluginPath)
  if (existing) return existing
  if (!autoInstall) {
    throw new Error('未找到 uv，请先安装：https://docs.astral.sh/uv/')
  }
  const binDir = path.join(pluginPath, 'bin')
  fs.mkdirSync(binDir, { recursive: true })
  const dest = path.join(binDir, 'uv')
  execSync(
    `curl -LsSf https://astral.sh/uv/install.sh | UV_INSTALL_DIR="${binDir}" sh`,
    { stdio: 'pipe', timeout: 180000, env: { ...process.env, UV_INSTALL_DIR: binDir } },
  )
  if (!fs.existsSync(dest)) {
    throw new Error('uv 自动安装失败')
  }
  try {
    fs.chmodSync(dest, 0o755)
  } catch {}
  return dest
}
