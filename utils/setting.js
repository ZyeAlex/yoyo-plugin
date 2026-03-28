/**
 * 配置文件 ———— 用于配置和文件读写
 * 
 */
import path from 'path'
import fs from 'fs'
import YAML from 'yaml'

class Setting {
  constructor() {
    // 云崽地址
    this.yunzaiPath = process.cwd().replace(/\\/g, '/')
    // 本插件地址
    this.path = this.yunzaiPath + '/plugins/yoyo-plugin'
    // 初始化config
    this.config = this.initConfig()
    // 匹配前缀
    this.rulePrefix = '(?:(?:' + this.config.rulePrefix.join('|') + ') *)'

  }
  // 配置文件
  initConfig() {
    if (!fs.existsSync(path.join(this.path, 'config/config.yaml'))) {
      fs.copyFileSync(path.join(this.path, 'config/default.yaml'), path.join(this.path, 'config/config.yaml'))
    }
    let defConfig = this.getData('config/default')
    let config = this.getData('config/config') || {}

    // 增量更新配置
    Object.keys(defConfig).forEach(key => {
      if (!(key in config)) {
        config[key] = defConfig[key]
      }
    })
    this.setData('config/config', config)
    return config
  }
  /**
   * 获取YAML数据
   * @param {*} filePath yaml文件地址
   */
  getData(filePath, defValue, root = 'yoyo') {
    root = root == 'yoyo' ? this.path : root == 'yunzai' ? this.yunzaiPath : root
    filePath = path.join(root, filePath)
    if (!filePath.includes('.yaml')) {
      filePath += '.yaml'
    }
    let dirPath = path.dirname(filePath)
    let filename = path.basename(filePath)
    try {
      if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })
      if (!fs.existsSync(filePath)) return defValue
      return YAML.parse(fs.readFileSync(filePath, 'utf8'))
    } catch (error) {
      logger.error(`[${filename}] 读取失败 ${error}`)
      return defValue
    }
  }
  // 写入对应模块数据文件
  setData(filePath, data, root = 'yoyo') {
    root = root == 'yoyo' ? this.path : root == 'yunzai' ? this.yunzaiPath : root
    filePath = path.join(root, filePath)
    if (!filePath.includes('.yaml')) {
      filePath += '.yaml'
    }
    let dirPath = path.dirname(filePath)
    let filename = path.basename(filePath)
    try {
      if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })
      fs.writeFileSync(filePath, YAML.stringify(data), 'utf8')
    } catch (error) {
      logger.error(`[${filename}] 写入失败 ${error}`)
      return false
    }
    return true
  }
}

export default new Setting()
