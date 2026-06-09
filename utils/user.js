/**
 * 用户配置
 * 
 */
import setting from '#setting'

/** 账号目录 user/76239010/info.yaml
 * 
 * qq: 76239010
 * uids: [12345678, 12345678]
 * active: 0
 */

class User {
  async getUserInfo(qq) {
    return setting.getData('data/user/' + qq + '/info', {}, 'yunzai')
  }

  async bindUids(group, qq, uid) {
    let info = await this.getUserInfo(qq)
    info.uids = info.uids || []
    let length = info.uids.length
    if (!info.uids.includes(uid)) {
      info.uids.push(uid)
      info.active = length
    }
    setting.setData('data/user/' + qq + '/info', info, 'yunzai')
    return info
  }

  async unbindUids(group, qq, uidOrIndex) {
    let info = await this.getUserInfo(qq)
    info.uids = info.uids || []
    let index = uidOrIndex
    if (String(uidOrIndex).length >= 8) {
      index = info.uids.indexOf(uidOrIndex)
    }
    if (index > -1 && index < info.uids.length) {
      info.uids.splice(index, 1)
      if (info.active >= index) {
        info.active--
        if (info.active < 0) delete info.active
      }
    } else {
      throw new Error('未查到对应索引或uid')
    }
    setting.setData('data/user/' + qq + '/info', info, 'yunzai')
    return info
  }

  async changeUids(qq, uidOrIndex) {
    let info = await this.getUserInfo(qq)
    let index = uidOrIndex
    if (String(uidOrIndex).length >= 8) {
      index = info.uids.indexOf(uidOrIndex)
    }
    if (index > -1 && index < info.uids.length) {
      info.active = index
    } else {
      throw new Error('错误的索引或uid')
    }
    setting.setData('data/user/' + qq + '/info', info, 'yunzai')
    return info
  }

  async getGameInfo(uid, isUpdate) {
    if (isUpdate) await this.updateGameInfo(uid)
    let info = { uid, heros: [] }
    return setting.getData('data/uid/' + uid + '/info', info, 'yunzai')
  }

  async updateGameInfo(uid) {
    setting.setData('data/uid/' + uid + '/info', { uid, heros: [] }, 'yunzai')
  }
}

export default new User()
