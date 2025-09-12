/**
 * 配置文件 ———— 用于所有的配置和文件读写
 * 
 */
import path from 'path'
import https from 'https'
import fs from 'fs'
import YAML from 'yaml'
import chokidar from 'chokidar'
import MD5 from 'md5'
import bot from 'nodemw'
import { promisify } from 'util'
import { pipeline } from 'stream'
import { getHeroData, getPetData } from '../api/wiki/data.js'
import { getNotice } from '../api/wiki/page.js'
import utils from '#utils'

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

    /**
     * 角色数据
     */
    this.nicknames = this.getData('nickname', 'hero') // 角色昵称  {101003:['唐悠悠']}
    this.heros = this.getData('default', 'hero') || {} // 角色数据 { 101003:{ /* 角色数据 */ } }
    this.heroImgs = {} //角色图片 {101003:[]}

    /**
     * 奇波数据
     */
    this.petIds = {}
    this.pets = this.getData('default', 'pet') || {}

    /**
     * UI 图片
     */
    this.UI = []

    /**
     * 成就系统
     */
    this.achievements = this.getData('default', 'achievement') || []
    /**
     * 装备系统
     */
    this.accessories = this.getData('default', 'accessory') || []
    /**
     * 食物系统
     */
    this.foods = this.getData('default', 'food') || []
    /**
     * 建造系统
     */
    this.buildings = this.getData('default', 'building') || []

    // 初始化
    this.initConfig()
    this.initData()
    // 初始化config
    this.config = this.getConfig('config')
    // 匹配前缀
    this.rulePrefix = '(?:(?:' + this.config.rulePrefix.join('|') + ') *)'

  }

  /** 初始化配置 */
  async initConfig() {
    const files = fs.readdirSync(this.defPath).filter(file => file.endsWith('.yaml'))
    for (let file of files) {
      if (!fs.existsSync(`${this.configPath}${file}`)) {
        fs.copyFileSync(`${this.defPath}${file}`, `${this.configPath}${file}`)
      }
      let config_name = file.replace('.yaml', '')
      const watcher = chokidar.watch(`${this.configPath}${file}`)
      watcher.on('change', () => {
        logger.mark(`[蓝色星原旅谣插件][修改配置文件][${config_name}]`)
        if (this[config_name]) {
          this[config_name] = this.getConfig(config_name)
        }
      })
    }
  }
  async initData() {
    // 初始化logs
    if (!fs.existsSync(path.join(this.path, '/data/logs'))) {
      fs.mkdirSync(path.join(this.path, '/data/logs'), { recursive: true })
    }
    // 初始化UI icon
    if (!fs.existsSync(path.join(this.path, '/resources/UI'))) {
      fs.mkdirSync(path.join(this.path, '/resources/UI'), { recursive: true })
    }
    this.UI = fs.readdirSync(path.join(this.path, '/resources/UI'))
    this.initImg()

    // 获取角色
    this.getHeroData().then(() => this.getImg(this.heros, 'hero'))
    // 获取奇波
    this.getPetData().then(() => this.getImg(this.pets, 'pets'))
    // 获取成就
    this.getImg(this.achievements, 'achievements')
    // 获取装备
    this.getImg(this.accessories, 'accessories')
    // 获取食物
    this.getImg(this.foods, 'foods')
    // 获取建造
    this.getImg(this.buildings, 'buildings')
    // 获取公告
    // todo  获取公告  测试
    this.notices = await getNotice()
  }

  /**
   * 从Wiki获取配置数据
   */
  async getHeroData() {
    this.heroIds = {} // 内部使用 角色->ID映射
    try {
      const heros = await getHeroData()
      Object.entries(heros).forEach(([heroId, heroData]) => {
        if (heroData) {
          this.heros[heroId] = heroData
          this.heroIds[heroData.name] = heroId
        }
      })
      // 初始化hero path
      if (!fs.existsSync(path.join(this.path, '/resources/img/hero'))) {
        fs.mkdirSync(path.join(this.path, '/resources/img/hero'), { recursive: true })
      }
      let heroImgPaths = [
        path.join(this.path, '/resources/img/hero'),
        ...(this.config.imgPath || []).map(imgPath => path.join(this.yunzaiPath, imgPath))
      ]
      // 遍历所有图片库路径
      heroImgPaths.forEach(heroImgPath => {
        // 查找角色图片
        if (!fs.existsSync(heroImgPath)) return
        let heroImgDirs = fs.readdirSync(heroImgPath)
        heroImgDirs.forEach(dir => {
          // 如果dir是目录
          if (!dir.startsWith('.') && fs.statSync(path.join(heroImgPath, dir)).isDirectory()) {

            let heroImgs = [...new Set([...(this.heroImgs[dir] || []), ...fs.readdirSync(path.join(heroImgPath, dir)).map(fileName => path.join(heroImgPath, dir, fileName))])]
            let heroId = this.getHeroId(dir)
            logger.info(heroId)
            if (heroId) {
              this.heroImgs[heroId] = heroImgs
            }
          }
        })

      })
    } catch (error) {
      error && logger.error(`[yoyo-plugin][getHeroData]${error}`)
    }
  }
  async getPetData() {
    try {
      const pets = await getPetData()
      let rank = {}
      Object.entries(pets).forEach(([petId, petData]) => {
        if (petData) {
          this.pets[petId] = petData
          this.petIds[petData.name] = petId
          // 记录进化路线
          let nextPetId = petData?.rank?.evolutionAfterStart
          let rankArr = rank[petId] || rank[nextPetId] || []
          rank[petId] = rankArr

          if (nextPetId) {
            rank[nextPetId] = rankArr

            // 当前节点是否存在
            let index = rankArr.findIndex(item => item == petId)
            let nextIndex = rankArr.findIndex(item => item == nextPetId)
            if (index > -1 && nextIndex > -1) {
              return
            }
            if (index > -1) {
              rankArr.splice(index + 1, 0, nextPetId)
            } else if (nextIndex > -1) {
              rankArr.splice(nextIndex, 0, petId)
            } else {
              rankArr.unshift(nextPetId)
              rankArr.unshift(petId)
            }

          }
          petData.evolution = rankArr
        }
      })
    } catch (error) {
      logger.error(`[yoyo-plugin][getPetData]${error}`)
    }
  }

  // 配置对象化 用于锅巴插件界面填充
  merge() {
    let sets = {}
    let appsConfig = fs.readdirSync(this.defPath).filter(file => file.endsWith(".yaml"));
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


  // 查询是否有此角色，有则返回角色ID
  getHeroId(name) {
    // name为 heroId
    if (name in this.heros) {
      return name
    }
    // name 为角色名
    if (this.heroIds[name]) {
      return this.heroIds[name]
    }
    if (!(name in this.heroIds)) {
      // 遍历
      for (let heroId in this.nicknames) {
        if (this.nicknames[heroId]?.includes?.(name)) {
          return heroId
        }
      }
    }
    const result = utils.findBestMatch(name, this.nicknames)
    if (result.score >= 0.5) {
      return this.heroIds[result.value]
    }
  }

  // 设置昵称
  setHeroNickname(name, nickname) {
    if (!this.nicknames[name]) {
      this.nicknames[name] = []
    }
    if (!this.nicknames[name].includes(nickname)) {
      this.nicknames[name].push(nickname)
    }
    return this.setData('nickname', this.nicknames,)
  }
  // 删除昵称
  delHeroNickname(name, nickname) {
    if (!this.nicknames[name]) {
      return '该角色没有此别名'
    }
    if (this.nicknames[name].includes(nickname)) {
      this.nicknames[name].splice(this.nicknames[name].indexOf(nickname), 1)
    }
    const res = this.setData('nickname', this.nicknames,)
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
  // 保存角色图片
  async setHeroImgs(heroId, imageMessages) {
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
      if (val.filename) {
        fileName = val.filename.substring(0, val.file.lastIndexOf('.'))
        fileType = val.filename.substring(val.file.lastIndexOf('.') + 1)
      }
      if (response.headers.get('content-type') === 'image/gif') {
        fileType = 'gif'
      }
      if (!'jpg,jpeg,png,webp'.split(',').includes(fileType)) {
        // 角色图像默认jpg
        fileType = 'jpg'
      }

      // 角色图片文件夹地址
      let heroImgPath = `${this.path}/resources/img/hero/${this.heros[heroId].name}`
      if (!fs.existsSync(heroImgPath)) {
        fs.mkdirSync(heroImgPath, { recursive: true })
      }

      let imgPath = `${heroImgPath}/${fileName}.${fileType}`
      const streamPipeline = promisify(pipeline)
      await streamPipeline(response.body, fs.createWriteStream(imgPath))
      // 使用md5作为文件名
      let buffers = fs.readFileSync(imgPath)
      let base64 = Buffer.from(buffers, 'base64').toString()
      let md5 = MD5(base64)
      let newImgPath = `${heroImgPath}/${md5}.${fileType}`
      if (fs.existsSync(newImgPath)) {
        fs.unlink(newImgPath, (err) => { })
      }
      fs.rename(imgPath, newImgPath, () => { })
      if (!this.heroImgs[heroId]) this.heroImgs[heroId] = []
      this.heroImgs[heroId].push(`${heroImgPath}/${md5}.${fileType}`)
      str += `✅图片上传成功\n`
      imgCount++
    }
    str += `成功上传${imgCount}张${this.heros[heroId].name}图片`
    return str
  }
  // 删除图片
  delHeroImg(heroId, imgFiles) {
    imgFiles.forEach(imgFile => {
      if (fs.existsSync(imgFile)) {
        fs.unlinkSync(imgFile)
        this.heroImgs[heroId] = this.heroImgs[heroId].filter(file => file !== imgFile)
      }
    })
    return true
  }

  /**
   * 下载UI图标
   */
  initImg() {
    // 要下载的图片列表
    let imgs = []
    // 是否正在下载图片
    let loading = false
    // 定义匹配模式的正则表达式
    const pattern = /^tex_[a-zA-Z0-9_]+\.(png|jpg|jpeg|gif)$/;
    // 日志
    let logs = {}
    // wiki 链接
    const client = new bot({
      protocol: "https",
      server: "wiki.biligame.com",
      path: "/ap",
      debug: false,
    });


    // 获取help图片
    let { helpGroup, includeIcon, excludeIconReg } = this.getData('help')

    // 递归处理对象
    const traverse = (current) => {
      if (typeof current === 'object' && current !== null) {
        for (const key in current) {
          if (current.hasOwnProperty(key)) {
            if (typeof current[key] === 'string' && pattern.test(current[key]) && excludeIconReg.every(item => !current[key].includes(item))) {
              imgs.push(current[key]) // 保存图片地址
            } else if (typeof current[key] === 'object') {
              traverse(current[key]);
            }
          }
        }
      } else if (Array.isArray(current)) {
        for (let i = 0; i < current.length; i++) {
          if (typeof current[i] === 'string' && pattern.test(current[i]) && excludeIconReg.every(item => !current[key].includes(item))) {
            imgs.push(current[i]) // 保存图片地址
          } else if (typeof current[i] === 'object') {
            traverse(current[i]);
          }
        }
      }
    }
    // 获取图片地址
    const getImgUrl = (imgName, source) => {
      switch (source) {
        case 'wiki':
          return new Promise((res, rej) => {
            client.getImageInfo('文件:' + imgName, (err, info) => {
              if (err || !info?.url) {
                return rej(`[wiki] ❌️ 未从Wiki查询到图片：${imgName}`)
              }
              return res(info?.url)
            });
          })
        default:
          return source + imgName
      }
    }
    // 下载图片
    const preDownImg = (imgName, imgUrl) => {
      return new Promise(async (resolve, reject) => {
        const file = fs.createWriteStream(path.join(this.path, 'resources/UI', imgName));
        https.get(imgUrl, (response) => {
          if (response.statusCode != 200) {
            fs.unlink(path.join(this.path, 'resources/UI', imgName), () => { });
            return reject(`[${response.statusCode}] ❌️ ${imgName}下载失败`)
          }
          response.pipe(file);
          file.on('finish', () => resolve(file.close()));
        }).on('error', (err) => {
          fs.unlink(path.join(this.path, 'resources/UI', imgName), () => { });
          reject(` ❌️ ${err}`);
        });
      });
    }



    // 流程函数
    let getImg = async (obj) => {
      // 时间差
      // 一个小时内不重复更新图标
      let time = await redis.get('yoyo:ui')
      if (time && utils.getDateDiffHours(time, new Date()) < 1) {
        return logger.info(`[yoyo-plugin] 🎈 上次下载图库于一小时内，不再重复下载`)
      }
      // 搜集图标
      traverse(obj)
      let sourceIndex = 0 // 图片源
      // queue内有未处理完任务，且pool内无运行中任务
      while (imgs.length && !loading) {
        let imgName = imgs.shift()// 从queue中取出一张图片
        if (this.UI.includes(imgName)) continue //过滤
        loading = true
        try {
          const imgUrl = await getImgUrl(imgName, this.config.iconSource[sourceIndex])
          await preDownImg(imgName, imgUrl)
          this.UI.push(imgName)
          sourceIndex = 0
        } catch (error) {
          logs[imgName] = [...(logs[imgName] || []), error]
          // 更换图片源
          if (sourceIndex < this.config.iconSource.length - 1) {
            imgs.unshift(imgName)
            sourceIndex++
          } else {
            this.UI.push(imgName) // 不再重复下载该图片
          }
        }
        await utils.sleep(500)
        loading = false
      }

      if (!imgs.length) {
        // 保存日志
        this.setData('ui-logs', logs, 'logs')
        redis.set('yoyo:ui', new Date().toJSON())

      }
    }
    this.getImg = getImg
    getImg(helpGroup)
    getImg(includeIcon)
  }
}


export default new Setting()
