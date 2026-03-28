/**
 * 配置文件 ———— 用于所有的配置和文件读写
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
  constructor() {

  }
  getUserInfo(qq) {
    return setting.getData('data/user/' + qq + '/info', {})
  }

  async bindAccount(group, qq, uid) {
    // 获取用户信息
    let info = this.getUserInfo(qq)
    // 绑定uid
    info.uids = info.uids || []
    let length = info.uids.length
    if (!info.uids.includes(uid)) {
      info.uids.push(uid)   // 添加uid
      info.active = length  // 设置当前激活的uid
    }
    // 保存信息
    setting.setData('data/user/' + qq + '/info', info)
    return info
  }
  async unbindAccount(group, qq, uidOrIndex) {
    // 获取用户信息
    let info = this.getUserInfo(qq)
    // 删除uid
    info.uids = info.uids || []
    let index = uidOrIndex
    // 将uid转换为索引
    if (uidOrIndex.length >= 8) {
      index = info.uids.indexOf(uidOrIndex)
    }
    // 删除对应索引
    if (index > -1 && index < info.uids.length) {
      info.uids.splice(index, 1)
      if (info.active >= index) {
        info.active--
        info.active < 0 && delete info.active
      }
    }
    // 未匹配到索引
    else {
      e.reply(
        [
          '未查到对应索引或uid'
        ]
      )
      return
    }

    // 保存信息
    setting.setData('data/user/' + qq + '/info', info)
    return info
  }
  async changeAccount(qq, uidOrIndex) {
    // 获取用户信息
    let info = this.getUserInfo(qq)
    // 将uid转换为索引
    if (uidOrIndex.length >= 8) {
      index = info.uids.indexOf(uidOrIndex)
    }
    if (index > -1 && index < info.uids.length) {
      info.active = index
    }
    else {
      e.reply(
        [
          '错误的索引或uid'
        ]
      )
      return
    }
    return info
  }
}

export default new User()
