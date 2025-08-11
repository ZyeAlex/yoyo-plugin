/**
 * 配置文件 ———— 用于所有的配置和文件读写
 * 
 */

import YAML from 'yaml'
import chokidar from 'chokidar'
import fs from 'node:fs'
import MD5 from 'md5'
import { promisify } from 'util'
import { pipeline } from 'stream'
import { getNotice } from '../api/wiki.js'
import lodash from 'lodash'
class Setting {
  constructor() {
    // 云崽地址
    this.yunzaiPath = process.cwd().replace(/\\/g, '/')
    // 本插件地址
    this.path = this.yunzaiPath + '/plugins/yoyo-plugin'
    /** 默认设置 */
    this.defPath = `${this.path}/config/default/`
    this.defSet = {}
    /** 用户设置 */
    this.configPath = `${this.path}/config/`
    this.config = {}
    /** 数据设置 */
    this.dataPath = `${this.path}/data/`
    this.data = {}
    /** 监听文件 */
    this.watcher = { config: {}, defSet: {} }

    // 初始化
    this.initCfg()
    this.initReq()
    // 初始化config
    this.config = this.getConfig('config')
    // 匹配前缀
    this.rulePrefix = '(?:(?:' + this.config.rulePrefix.join('|') + ') *)'

  }

  /** 初始化配置 */
  initCfg() {
    const files = fs.readdirSync(this.defPath).filter(file => file.endsWith('.yaml'))
    for (let file of files) {
      if (!fs.existsSync(`${this.configPath}${file}`)) {
        fs.copyFileSync(`${this.defPath}${file}`, `${this.configPath}${file}`)
      }
      this.watch(`${this.configPath}${file}`, file.replace('.yaml', ''), 'config')
    }
  }
  // 初始化请求
  async initReq() {
    // 获取角色
    this.roles = this.getData('list', 'role')
    this.nicknames = this.getData('nickname', 'role') || {}
    // 获取奇波
    this.qibos = this.getData('qibo', this.qibos)
    // this.qibos = await getQibos()
    // this.setData('qibo', this.qibos)
    // todo  获取公告  测试
    this.notices = await getNotice()
  }
  // 监听配置文件
  watch(file, app, type = 'defSet') {
    if (this.watcher[type][app]) return

    const watcher = chokidar.watch(file)
    watcher.on('change', path => {
      delete this[type][app]
      logger.mark(`[蓝色星原旅谣插件][修改配置文件][${type}][${app}]`)
      if (this[`change_${app}`]) {
        this[`change_${app}`]()
      }
    })
    this.watcher[type][app] = watcher
  }
  // 配置对象化 用于锅巴插件界面填充
  merge() {
    let sets = {}
    let appsConfig = fs.readdirSync(this.defPath).filter(file => file.endsWith('.yaml'))
    for (let appConfig of appsConfig) {
      // 依次将每个文本填入键
      let filename = appConfig.replace(/.yaml/g, '').trim()
      sets[filename] = this.getConfig(filename)
    }
    return sets
  }
  // 配置对象分析 用于锅巴插件界面设置
  analysis(config) {
    for (let key of Object.keys(config)) {
      this.setConfig(key, config[key])
    }
  }


  /**
   * 操作config
   */


  // 获取对应模块用户配置
  getConfig(app) {
    return { ...this.getdefSet(app), ...this.getYaml(app, 'config') }
  }
  // 设置对应模块用户配置
  setConfig(app, Object) {
    return this.setYaml(app, 'config', { ...this.getdefSet(app), ...Object })
  }
  // 获取对应模块默认配置
  getdefSet(app) {
    return this.getYaml(app, 'defSet')
  }
  // 读取YAML文件 返回对象
  getYaml(app, type) {
    let file = this.getFilePath(app, type)
    if (this[type][app]) return this[type][app]
    try {
      this[type][app] = YAML.parse(fs.readFileSync(file, 'utf8'))
    } catch (error) {
      logger.error(`[${app}] 格式错误 ${error}`)
      return false
    }
    this.watch(file, app, type)
    return this[type][app]
  }
  // 将对象写入YAML文件
  setYaml(app, type, Object) {
    let file = this.getFilePath(app, type)
    try {
      fs.writeFileSync(file, YAML.stringify(Object), 'utf8')
    } catch (error) {
      logger.error(`[${app}] 写入失败 ${error}`)
      return false
    }
  }
  // 获取YAML文件目录
  getFilePath(app, type) {
    if (type === 'defSet') return `${this.defPath}${app}.yaml`
    else {
      try {
        if (!fs.existsSync(`${this.configPath}${app}.yaml`)) {
          fs.copyFileSync(`${this.defPath}${app}.yaml`, `${this.configPath}${app}.yaml`)
        }
      } catch (error) {
        logger.error(`蓝色星原插件缺失默认文件[${app}]${error}`)
      }
      return `${this.configPath}${app}.yaml`
    }
  }


  /**
   * 操作 data
   */
  // 获取对应模块数据文件
  getData(filename, path = '') {
    path = `${this.dataPath}${path}/`
    try {
      if (!fs.existsSync(`${path}${filename}.yaml`)) { return false }
      return YAML.parse(fs.readFileSync(`${path}${filename}.yaml`, 'utf8'))
    } catch (error) {
      logger.error(`[${filename}] 读取失败 ${error}`)
      return false
    }
  }
  // 写入对应模块数据文件
  setData(filename, data, path = '') {
    path = `${this.dataPath}${path}/`
    try {
      if (!fs.existsSync(path)) {
        // 递归创建目录
        fs.mkdirSync(path, { recursive: true })
      }
      fs.writeFileSync(`${path}${filename}.yaml`, YAML.stringify(data), 'utf8')
    } catch (error) {
      logger.error(`[${filename}] 写入失败 ${error}`)
      return
    }
    return true
  }


  // 查询是否有此角色，有则返回角色原本名称
  getRoleName(name) {
    // 直接返回角色名
    if (name in this.roles) {
      return name
    }
    // 遍历
    for (let roleName in this.nicknames) {
      if (this.nicknames[roleName]?.includes?.(name)) {
        return roleName
      }
    }
  }
  // 设置昵称
  setRoleNickname(name, nickname) {
    if (!this.nicknames[name]) {
      this.nicknames[name] = []
    }
    if (!this.nicknames[name].includes(nickname)) {
      this.nicknames[name].push(nickname)
    }
    return this.setData('nickname', this.nicknames, 'role')
  }
  // 删除昵称
  delRoleNickname(name, nickname) {
    if (!this.nicknames[name]) {
      return '该角色没有此别名'
    }
    if (this.nicknames[name].includes(nickname)) {
      this.nicknames[name].splice(this.nicknames[name].indexOf(nickname), 1)
    }
    const res = this.setData('nickname', this.nicknames, 'role')
    return res ? '删除别名成功' : '删除别名失败'
  }

  // 获取用户签到数据列表
  getUserData(group_id, user_id) {
    if (!this.userData) {
      this.userData = {}
    }
    if (!this.userData[group_id]) {
      this.userData[group_id] = this.getData(group_id, '/user') || {}
    }
    let userData = this.userData[group_id][user_id] || { history: {} }
    // 防止错误数据
    if (!userData.history) {
      userData.history = {}
    }
    return userData
  }
  // 保存用户数据
  saveUserData(group_id, user_id, userSignList) {
    this.userData[group_id][user_id] = userSignList
    this.setData(group_id, this.userData[group_id], '/user')
  }


  /**
   * 操作resource
   */

  // 获取角色图片列表
  getRoleImgs(roleName) {
    let roleImgPath = `${this.path}/resources/img/role/${roleName}`
    if (!fs.existsSync(roleImgPath)) {
      fs.mkdirSync(roleImgPath, { recursive: true })
    }
    // 查询文件夹下的所有图片列表
    let roleImgs = fs.readdirSync(roleImgPath).map(fileName => `${this.path}/resources/img/role/${roleName}/${fileName}`)
    return roleImgs
  }
  // 保存角色图片
  async setRoleImgs(roleName, imageMessages) {
    let str = ''
    let imgCount = 0
    for (let val of imageMessages) {
      // 下载图片
      const response = await fetch(val.url)
      if (!response.ok) {
        str += `❌图片上传失败\n`
        continue
      }
      if (response.headers.get('size') > 1024 * 1024 * this.config.imgMaxSize) {
        str += `❌图片上传失败：图片太大了\n`
        continue
      }
      let fileName = ''
      let fileType = 'png'
      if (val.file) {
        fileName = val.file.substring(0, val.file.lastIndexOf('.'))
        fileType = val.file.substring(val.file.lastIndexOf('.') + 1)
      }
      if (response.headers.get('content-type') === 'image/gif') {
        fileType = 'gif'
      }
      if (!'jpg,jpeg,png,webp'.split(',').includes(fileType)) {
        // 角色图像默认jpg
        fileType = 'jpg'
      }

      // 角色图片文件夹地址
      let roleImgPath = `${this.path}/resources/img/role/${roleName}`
      if (!fs.existsSync(roleImgPath)) {
        fs.mkdirSync(roleImgPath, { recursive: true })
      }

      let imgPath = `${roleImgPath}/${fileName}.${fileType}`
      const streamPipeline = promisify(pipeline)
      await streamPipeline(response.body, fs.createWriteStream(imgPath))
      // 使用md5作为文件名
      let buffers = fs.readFileSync(imgPath)
      let base64 = Buffer.from(buffers, 'base64').toString()
      let md5 = MD5(base64)
      let newImgPath = `${roleImgPath}/${md5}.${fileType}`
      if (fs.existsSync(newImgPath)) {
        fs.unlink(newImgPath, (err) => { console.log('unlink', err) })
      }
      fs.rename(imgPath, newImgPath, () => { })
      str += `✅图片上传成功\n`
      imgCount++
    }
    str += `成功上传${imgCount}张${roleName}图片`
    return str
  }
  // 删除图片
  delRoleImg(roleName, imgFiles) {
    let roleImgPath = `${this.path}/resources/img/role/${roleName}`
    if (!fs.existsSync(roleImgPath)) {
      return
    }
    imgFiles.forEach(imgFile => {
      if (fs.existsSync(imgFile)) {
        fs.unlinkSync(imgFile)
      }
    })
    return true
  }
}

export default new Setting()
