/**
 * 配置文件 ———— 用于所有的配置和文件读写
 * 
 */
import path from 'path'
import fs from 'fs'
import MD5 from 'md5'
import { promisify } from 'util'
import { pipeline } from 'stream'
import setting from './setting.js'
import { getWikiData } from '../api/wiki/data.js'
import initUI from './UI.js'

class Game {
  constructor() {
    /**
     * 角色数据
     */
    this.nicknames = setting.getData('data/game/default/nickname', {}) // 角色昵称  {101003:['唐悠悠']}
    this.heros = setting.getData('data/game/hero', {})  // 角色数据 { 101003:{ /* 角色数据 */ } }
    this.heroImgs = {} //角色图片 {101003:[]}

    /**
     * 奇波数据
     */
    this.petIds = {}
    this.pets = setting.getData('data/game/pet', {})
    /**
     * 装备系统
     */
    this.sets = {}//套装效果
    this.accessories = {}//装备列表

    /**
     * 成就系统
     */
    this.achievements = setting.getData('data/game/default/achievement', [])
    /**
     * 食物系统
     */
    this.foods = setting.getData('data/game/default/food', [])
    /**
     * 建造系统
     */
    this.buildings = setting.getData('data/game/default/building', [])
    /**
     * 任务道具
     */
    this.taskItems = setting.getData('data/game/default/task-item', [])

    // 初始化数据
    this.initData()

  }
  /** 初始化数据 */
  async initData() {
    // 初始化UI函数
    this.getUI = initUI.call(this)
    // 获取角色
    this.getHeroData().then(() => this.getUI(this.heros))
    // 获取奇波
    this.getPetData().then(() => this.getUI(this.pets))
    // 获取成就
    this.getUI(this.achievements)
    // 获取装备
    this.getAccessoryData().then(() => this.getUI(this.accessories))
    // 获取食物
    this.getUI(this.foods)
    // 获取建造
    this.getUI(this.buildings)
    // 获取任务道具
    this.getUI(this.taskItems)
  }
  /**
   * 从网络获取配置数据
   */
  async getHeroData() {
    this.heroIds = {} // 内部使用 角色->ID映射
    try {
      // 合并数据
      const heros = await getWikiData('Hero')
      heros?.forEach(hero => {
        // 对女主进行重命名
        if (hero.id == '199001') {
          hero.name = '星临者'
        }
        // 对男主进行过滤
        if (hero.id == '199002') {
          return
        }

        // 保存角色数据
        if (!this.heros[hero.id]) this.heros[hero.id] = hero 
        Object.assign(this.heros[hero.id], hero)
      })
      setting.setData('data/game/hero', this.heros)
    } catch (error) {
      logger.error(`[yoyo-plugin][getHeroData]${error}`)
    }
    this.heroIds = Object.entries(this.heros).reduce((heroIds, [heroId, { name }]) => {
      heroIds[name] = heroId
      return heroIds
    }, {})

    // 获取角色图片
    this.getHeroImgs()

    // 设置角色昵称
    if (!fs.existsSync(path.join(setting.path, 'data/game/nickname.yaml'))) {
      fs.copyFileSync(path.join(setting.path, 'data/game/default/nickname.yaml'), path.join(setting.path, 'data/game/nickname.yaml'))
    } else {
      const nicknames = setting.getData('data/game/nickname')
      Object.entries(nicknames).forEach(([id, names]) => this.nicknames[id] = [... new Set([...(this.nicknames[id] || []), ...names])])
    }
  }
  async getHeroImgs() {
    // 清空图片
    this.heroImgs = {}
    // 初始化hero path
    if (!fs.existsSync(path.join(setting.path, '/resources/img/hero'))) {
      fs.mkdirSync(path.join(setting.path, '/resources/img/hero'), { recursive: true })
    }
    let heroImgPaths = [
      path.join(setting.path, '/resources/img/hero'),
      ...(setting.config.imgPath || []).map(imgPath => path.join(setting.yunzaiPath, imgPath))
    ]
    // 遍历所有图片库路径
    heroImgPaths.forEach(heroImgPath => {
      // 查找角色图片
      if (!fs.existsSync(heroImgPath)) return
      let heroImgDirs = fs.readdirSync(heroImgPath)
      heroImgDirs.forEach(dir => {
        // 如果dir是目录
        if (!dir.startsWith('.') && fs.statSync(path.join(heroImgPath, dir)).isDirectory()) {
          let heroId = this.getHeroId(dir)
          if (heroId) {
            let heroImgs = [
              ...new Set([...(this.heroImgs[heroId] || []),
              ...fs.readdirSync(path.join(heroImgPath, dir)).map(fileName => path.join(heroImgPath, dir, fileName))])
            ]
            this.heroImgs[heroId] = heroImgs
          }
        }
      })

    })
  }
  async getPetData() {
    try {
      let rank = {}

      // 合并数据
      const pets = await getWikiData('Kibo')
      pets.forEach(pet => {
        if (!this.pets[pet.id]) this.pets[pet.id] = {}
        Object.assign(this.pets[pet.id], pet)
      })

      Object.entries(this.pets).forEach(([petId, petData]) => {
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
      })
      setting.setData('data/game/pet', this.pets)
    } catch (error) {
      logger.error(`[yoyo-plugin][getPetData]${error}`)
    }
    this.petIds = Object.entries(this.pets).reduce((petIds, [petId, { name }]) => {
      petIds[name] = petId
      return petIds
    }, {})
  }
  async getAccessoryData() {
    try {
      let accessories = await getWikiData('Accessory')
      Object.values(accessories).forEach(item => (typeof item.texture == 'string') && (item.texture = item.texture.split(',')))// 兼容
      Object.assign(this.accessories, accessories)
      Object.entries(this.accessories).forEach(([accessoryId, { rarity, setId }]) => {
        if (setId?.id) {
          if (!this.sets[setId.id]) {
            this.sets[setId.id] = {
              rarity,
              ...setId,
              accessories: []
            }
          }
          this.sets[setId.id].accessories.push(accessoryId)
        }
      })
    } catch (error) {
      logger.error(`[yoyo-plugin][getAccessoryData]${error}`)
    }
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
      let heroImgPath = path.join(setting.path, '/resources/img/hero', this.heros[heroId].name)
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
}

export default new Game()
