/** 群名含「蓝色星原」才算星原群。不读配置。 */

export const XINGYUAN_MARK = '蓝色星原'

export function groupNameOf(e) {
  const direct = e?.group_name || e?.group?.group_name || e?.group?.name || ''
  if (direct) return String(direct)
  const gid = e?.group_id
  if (gid == null || gid === '') return ''
  if (typeof Bot === 'undefined' || typeof Bot.gl?.get !== 'function') return ''
  const info = Bot.gl.get(gid) || Bot.gl.get(String(gid)) || Bot.gl.get(Number(gid))
  return String(info?.group_name || info?.name || '')
}

export function isXingyuanGroup(e) {
  return groupNameOf(e).includes(XINGYUAN_MARK)
}
