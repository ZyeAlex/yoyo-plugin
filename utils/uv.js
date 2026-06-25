import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import axios from 'axios'

/** 中科大 GitHub Release 镜像（uv 官方文档推荐） */
const UV_MIRROR_BASE = 'https://mirrors.ustc.edu.cn/github-release/astral-sh/uv/LatestRelease/'

function uvBinName() {
  return process.platform === 'win32' ? 'uv.exe' : 'uv'
}

function pluginUvBin(pluginPath) {
  return path.join(pluginPath, 'bin', uvBinName())
}

function userLocalUvBin() {
  const home = process.env.HOME || process.env.USERPROFILE
  if (!home) return null
  return path.join(home, '.local', 'bin', uvBinName())
}

function findUvOnPath() {
  try {
    const cmd = process.platform === 'win32' ? 'where uv' : 'command -v uv'
    const out = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }).trim()
    const bin = out.split(/\r?\n/)[0]?.trim()
    return bin && fs.existsSync(bin) ? bin : null
  } catch {
    return null
  }
}

/** 查找本机或插件目录内的 uv 可执行文件 */
export function resolveUvBin(pluginPath) {
  const candidates = [
    pluginUvBin(pluginPath),
    findUvOnPath(),
    userLocalUvBin(),
  ].filter(Boolean)
  return candidates.find((p) => fs.existsSync(p)) || null
}

function uvTarget() {
  const { platform, arch } = process
  if (platform === 'win32') {
    if (arch === 'x64') return 'x86_64-pc-windows-msvc'
    if (arch === 'arm64') return 'aarch64-pc-windows-msvc'
    if (arch === 'ia32') return 'i686-pc-windows-msvc'
  }
  if (platform === 'darwin') {
    if (arch === 'arm64') return 'aarch64-apple-darwin'
    return 'x86_64-apple-darwin'
  }
  if (platform === 'linux') {
    if (arch === 'arm64') return 'aarch64-unknown-linux-gnu'
    if (arch === 'arm') return 'armv7-unknown-linux-gnueabihf'
    if (arch === 'ia32') return 'i686-unknown-linux-gnu'
    return 'x86_64-unknown-linux-gnu'
  }
  throw new Error(`不支持的平台：${platform} ${arch}`)
}

function buildUvDownloadUrl(assetName) {
  return `${UV_MIRROR_BASE}${assetName}`
}

function extractUvArchive(archivePath, tmpDir, target) {
  const isWin = process.platform === 'win32'
  if (isWin) {
    const extractDir = path.join(tmpDir, 'extract')
    fs.mkdirSync(extractDir, { recursive: true })
    const psArchive = archivePath.replace(/'/g, "''")
    const psExtract = extractDir.replace(/'/g, "''")
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${psArchive}' -DestinationPath '${psExtract}' -Force"`,
      { stdio: 'pipe' },
    )
    return path.join(extractDir, `uv-${target}`, 'uv.exe')
  }
  execSync(`tar -xzf "${archivePath}" -C "${tmpDir}"`, { stdio: 'pipe' })
  return path.join(tmpDir, `uv-${target}`, 'uv')
}

/** 从中科大镜像下载 uv 到插件 bin/ 目录 */
async function downloadUvBinary(pluginPath) {
  const target = uvTarget()
  const isWin = process.platform === 'win32'
  const ext = isWin ? 'zip' : 'tar.gz'
  const assetName = `uv-${target}.${ext}`
  const url = buildUvDownloadUrl(assetName)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yoyo-uv-'))
  const archivePath = path.join(tmpDir, assetName)
  const destBin = pluginUvBin(pluginPath)

  try {
    const { data } = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 120000,
      maxContentLength: Infinity,
      headers: { 'User-Agent': 'yoyo-plugin' },
    })
    fs.writeFileSync(archivePath, Buffer.from(data))

    const extracted = extractUvArchive(archivePath, tmpDir, target)
    if (!fs.existsSync(extracted)) {
      throw new Error(`解压后未找到 uv 可执行文件（${assetName}）`)
    }

    fs.mkdirSync(path.dirname(destBin), { recursive: true })
    fs.copyFileSync(extracted, destBin)
    if (!isWin) fs.chmodSync(destBin, 0o755)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }

  return destBin
}

/** 确保 uv 可用；autoInstall 为 true 时缺失则用 Node 自动下载安装 */
export async function ensureUv(pluginPath, autoInstall = false) {
  let bin = resolveUvBin(pluginPath)
  if (bin) {
    execSync(`"${bin}" --version`, { stdio: 'pipe' })
    return bin
  }
  if (!autoInstall) {
    throw new Error('未检测到 uv，请先发送 #安装悠悠')
  }
  bin = await downloadUvBinary(pluginPath)
  execSync(`"${bin}" --version`, { stdio: 'pipe' })
  return bin
}
