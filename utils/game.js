/**
 * 游戏数据
 * 
 */
import path from 'path'
import fs from 'fs'
import MD5 from 'md5'
import { promisify } from 'util'
import { pipeline } from 'stream'
import setting from './setting.js'
import {
  fetchCatalog,
  buildKiboEvolutionChains,
  lookupElement,
} from '../api/wiki/data.js'
import { fetchIconModule } from '../api/wiki/luaModule.js'
import initUI from './UI.js'
import { clearRenderCache } from './renderCache.js'

class Game {
  constructor() {
    /**
     * 基础数据
     */
    this.element = setting.getData('data/game/element', [])
    this.groups = setting.getData('data/game/groups', [])
    this.profession = setting.getData('data/game/profession', [])

    /**
     * 角色数据
     */
    this.nicknames = setting.getData('data/game/default/nickname', {}) // 角色昵称  {101003:['唐悠悠']}
    this.heros = setting.getData('data/game/hero', {})  // 角色数据 { 101003:{ /* 角色数据 */ } }
    this.heroIds = {} // 内部使用 角色->ID映射
    this.heroImgs = {} //角色图片 {101003:[]}

    /**
     * 奇波数据
     */
    this.petIds = {}
    this.pets = setting.getData('data/game/pet', {})

    /**
     * 灵子数据
     */
    this.spiritIds = {}
    this.spirits = setting.getData('data/game/spirit', {})

    /**
     * 物品数据
     */
    this.itemIds = {}
    this.items = setting.getData('data/game/item', {})

    /**
     * 装备系统
     */
    this.accessories = setting.getData('data/game/accessory', []) //装备列表

    this.ready = this.bootstrap()
  }

  dataFileExists(relPath) {
    return fs.existsSync(path.join(setting.path, `${relPath}.yaml`))
  }

  async bootstrap() {
    try {
      await this.getData({ mode: 'init' })
      logger.info('[yoyo-plugin][game] 数据初始化完成')
    } catch (err) {
      logger.error('[yoyo-plugin][game] 数据初始化失败', err)
    }
  }

  shouldFetchWiki(mode, isEmpty, cacheMissing = false) {
    return mode === 'refresh' || isEmpty || cacheMissing
  }

  normalizeGetDataOptions(arg1, arg2) {
    if (typeof arg1 === 'object' && arg1 !== null) {
      return { mode: arg1.mode || 'refresh', type: arg1.type }
    }
    if (typeof arg1 === 'boolean') {
      return { mode: arg1 ? 'init' : 'refresh', type: arg2 }
    }
    return { mode: 'refresh', type: arg1 }
  }

  /** @param {{ mode?: 'init'|'refresh', type?: string }}|boolean arg1 */
  async getData(arg1, arg2) {
    const { mode, type } = this.normalizeGetDataOptions(arg1, arg2)
    if (!this.getUI) {
      this.getUI = initUI.call(this)
    }
    const types = {
      Base: this.getBaseData,
      Hero: this.getHeroData,
      Kibo: this.getPetData,
      Spirit: this.getSpiritData,
      Accessory: this.getAccessoryData,
      Item: this.getItemData,
    }
    const run = async (fn) => {
      try {
        await fn.call(this, mode)
      } catch (err) {
        logger.error(`[yoyo-plugin][game] ${fn.name} 失败`, err)
      }
    }
    if (!type) {
      for (const fn of Object.values(types)) {
        await run(fn)
      }
    } else if (types[type]) {
      await run(types[type])
    } else {
      throw new Error(`Unknown data type: ${type}`)
    }
    if (mode === 'refresh') clearRenderCache(type)
    this.scheduleUIDownload()
  }

  /** 后台下载 UI 图标，不阻塞插件加载 */
  scheduleUIDownload() {
    if (this._uiDownloadTask) return
    this._uiDownloadTask = Promise.resolve()
      .then(() => this.getUI())
      .catch(err => logger.error('[yoyo-plugin][game] UI 图标下载失败', err))
      .finally(() => { this._uiDownloadTask = null })
  }
  /** 元素 / 阵营 / 职业：首次从 Wiki Lua 模块拉取并写入 yaml，之后读本地缓存 */
  async getBaseData(mode) {
    const baseKeys = [
      { key: 'element', field: 'element', module: 'element' },
      { key: 'groups', field: 'groups', module: 'groups' },
      { key: 'profession', field: 'profession', module: 'profession' },
    ]
    for (const { key, field, module } of baseKeys) {
      const storagePath = `data/game/${key}`
      const cacheMissing = !this.dataFileExists(storagePath)
      const isEmpty = !Array.isArray(this[field]) || !this[field].length
      if (this.shouldFetchWiki(mode, isEmpty, cacheMissing)) {
        logger.info(`[yoyo-plugin][game] ${key}.yaml 缺失或为空，从 Wiki 拉取...`)
        const rows = await fetchIconModule(module)
        if (rows.length) {
          this[field] = rows
          setting.setData(storagePath, this[field])
        }
      } else {
        this[field] = setting.getData(storagePath, this[field])
      }
    }
    return [...this.element, ...this.groups, ...this.profession]
  }

  getElementColor(elementName) {
    return lookupElement(elementName).elementColor
  }

  getHeroThemeColor(heroId) {
    const hero = this.heros[heroId]
    return hero?.elementData?.elementColor
      || this.getElementColor(hero?.element)
      || '#2563eb'
  }

  async getHeroData(mode) {
    const cacheMissing = !this.dataFileExists('data/game/hero')
    const isEmpty = !Object.keys(this.heros).length
    if (this.shouldFetchWiki(mode, isEmpty, cacheMissing)) {
      if (cacheMissing || isEmpty) {
        logger.info('[yoyo-plugin][game] hero.yaml 缺失或为空，从 Wiki 拉取角色数据...')
      }
      const rows = await fetchCatalog('Hero')
      const heros = {}
      rows?.forEach(hero => {
        if (hero.id == '199002') return
        if (hero.id == '199001') hero.name = '星临者'
        heros[hero.id] = hero
      })
      this.heros = heros
      setting.setData('data/game/hero', this.heros)
    }
    this.heroIds = Object.entries(this.heros).reduce((heroIds, [heroId, { name }]) => {
      heroIds[name] = heroId
      return heroIds
    }, {})

    this.getHeroImgs()

    if (!fs.existsSync(path.join(setting.path, 'data/game/nickname.yaml'))) {
      fs.copyFileSync(path.join(setting.path, 'data/game/default/nickname.yaml'), path.join(setting.path, 'data/game/nickname.yaml'))
    } else {
      const nicknames = setting.getData('data/game/nickname')
      Object.entries(nicknames).forEach(([id, names]) => this.nicknames[id] = [...new Set([...(this.nicknames[id] || []), ...names])])
    }
    return this.heros
  }
  async getHeroImgs() {
    this.heroImgs = {}
    if (!fs.existsSync(path.join(setting.path, '/resources/img/hero'))) {
      fs.mkdirSync(path.join(setting.path, '/resources/img/hero'), { recursive: true })
    }
    let heroImgPaths = [
      path.join(setting.path, '/resources/img/hero'),
      ...(setting.config.imgPath || []).map(imgPath => path.join(setting.yunzaiPath, imgPath))
    ]
    heroImgPaths.forEach(heroImgPath => {
      if (!fs.existsSync(heroImgPath)) return
      let heroImgDirs = fs.readdirSync(heroImgPath)
      heroImgDirs.forEach(dir => {
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
  async syncIdMapCatalog(mode, { catalogType, targetKey, idsKey, storagePath, postProcess }) {
    const cacheMissing = !this.dataFileExists(storagePath)
    const isEmpty = !Object.keys(this[targetKey]).length
    if (this.shouldFetchWiki(mode, isEmpty, cacheMissing)) {
      if (cacheMissing || isEmpty) {
        logger.info(`[yoyo-plugin][game] ${storagePath}.yaml 缺失或为空，从 Wiki 拉取...`)
      }
      const rows = await fetchCatalog(catalogType)
      this[targetKey] = {}
      rows.forEach(row => {
        this[targetKey][row.id] = row
      })
      postProcess?.call(this)
      setting.setData(storagePath, this[targetKey])
    }
    this[idsKey] = Object.entries(this[targetKey]).reduce((ids, [id, { name }]) => {
      ids[name] = id
      return ids
    }, {})
    return this[targetKey]
  }
  async getPetData(mode) {
    await this.syncIdMapCatalog(mode, {
      catalogType: 'Kibo',
      targetKey: 'pets',
      idsKey: 'petIds',
      storagePath: 'data/game/pet',
      postProcess() { buildKiboEvolutionChains(this.pets) },
    })
    buildKiboEvolutionChains(this.pets)
    return this.pets
  }
  async getSpiritData(mode) {
    return this.syncIdMapCatalog(mode, {
      catalogType: 'Spirit',
      targetKey: 'spirits',
      idsKey: 'spiritIds',
      storagePath: 'data/game/spirit',
    })
  }
  async getItemData(mode) {
    return this.syncIdMapCatalog(mode, {
      catalogType: 'Item',
      targetKey: 'items',
      idsKey: 'itemIds',
      storagePath: 'data/game/item',
    })
  }
  async getAccessoryData(mode) {
    const cacheMissing = !this.dataFileExists('data/game/accessory')
    const isEmpty = !this.accessories?.length
    if (this.shouldFetchWiki(mode, isEmpty, cacheMissing)) {
      if (cacheMissing || isEmpty) {
        logger.info('[yoyo-plugin][game] accessory.yaml 缺失或为空，从 Wiki 拉取...')
      }
      const accessories = await fetchCatalog('Accessory')
      if (accessories.length) this.accessories = accessories
    }
    setting.setData('data/game/accessory', this.accessories)
    return this.accessories
  }
  getHeroId(name) {
    if (name in this.heros) {
      return name
    }
    if (this.heroIds[name]) {
      return this.heroIds[name]
    }
    if (!(name in this.heroIds)) {
      for (let heroId in this.nicknames) {
        if (this.nicknames[heroId]?.includes?.(name)) {
          return heroId
        }
      }
    }
  }
  getPetId(name) {
    if (name in this.pets) return name
    return this.petIds[name]
  }
  getSpiritId(name) {
    if (name in this.spirits) return name
    return this.spiritIds[name]
  }
  getItemId(name) {
    if (name in this.items) return name
    return this.itemIds[name]
  }
  /**
   * 操作resource
   */
  async setHeroImgs(heroId, imageMessages) {
    let str = ''
    let imgCount = 0
    for (let val of imageMessages) {
      const response = await fetch(val.url)

      if (!response.ok) {
        str += `❌图片上传失败\n`
        continue
      }
      if (response.headers.get('size') > 1024 * 1024 * setting.config.imgMaxSize) {
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
        fileType = 'jpg'
      }

      let heroImgPath = path.join(setting.path, '/resources/img/hero', this.heros[heroId].name)
      if (!fs.existsSync(heroImgPath)) {
        fs.mkdirSync(heroImgPath, { recursive: true })
      }

      let imgPath = `${heroImgPath}/${fileName}.${fileType}`
      const streamPipeline = promisify(pipeline)
      await streamPipeline(response.body, fs.createWriteStream(imgPath))
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
