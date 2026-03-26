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
  async getUserInfo(qq) {
    return setting.getData('user/' + qq + '/info', {})
  }
  async bindAccount(uid, qq, group) {
    // 读取信息
    let info = this.getUserInfo(qq)

    // 绑定uid
    info.uids = info.uids || []
    let length = info.uids.length
    if (!info.uids.includes(uid)) {
      info.uids.push(uid)   // 添加uid
      info.active = length  // 设置当前激活的uid
    }
    // 保存信息
    setting.setData('user/' + qq + '/info', info)

  }
  async unbindAccount(uidOrIndex, qq, group) {
    // 读取信息
    let info = this.getUserInfo(qq)

    // 删除uid
    info.uids = info.uids || []
    let index = info.uids.indexOf(uidOrIndex)
    if (index !== -1) {
      arr.splice(index, 1)
    }

    // 保存信息
    setting.setData('user/' + qq + '/info', info)
  }



}

export default new User()
