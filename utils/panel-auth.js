import crypto from 'crypto'

const REDIS_PREFIX = 'yoyo:panel:token:'
/** 与 #悠悠登录 说明一致：24 小时 */
export const PANEL_TOKEN_TTL_SEC = 86400
/** 登录令牌长度（与锅巴快捷码同量级） */
const TOKEN_LENGTH = 16

function randomToken(length = TOKEN_LENGTH) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length]
  }
  return out
}

/** 为主人生成配置面板登录令牌（Redis 保存，默认 24h） */
export async function issuePanelToken(userId) {
  const token = randomToken()
  await redis.set(`${REDIS_PREFIX}${token}`, String(userId), { EX: PANEL_TOKEN_TTL_SEC })
  return token
}

/** 校验令牌，有效则返回绑定的 user_id */
export async function verifyPanelToken(token) {
  if (!token || typeof token !== 'string') return null
  try {
    const uid = await Promise.race([
      redis.get(`${REDIS_PREFIX}${token}`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('redis timeout')), 5000)),
    ])
    return uid || null
  } catch (err) {
    logger?.warn?.(`[yoyo-plugin] 面板令牌校验失败: ${err.message}`)
    return null
  }
}

export function extractPanelToken(req) {
  const header = req.headers['x-yoyo-token'] || req.headers['x-yoyo-panel-token']
  if (header) return String(header).trim()
  const auth = req.headers.authorization
  if (auth && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, '').trim()
  }
  if (req.query?.token) return String(req.query.token).trim()
  return ''
}
