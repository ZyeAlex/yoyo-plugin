/**
 * 游戏数据
 * 
 */
import path from 'path'
import fs from 'fs'
import MD5 from 'md5'
import setting from './setting.js'
import {
  fetchCatalog,
  buildKiboEvolutionChains,
  buildKiboPetIds,
  isKiboStorySpecial,
  lookupElement,
  loadAllLorePages,
  loadLorePage,
  refreshLoreCache,
  getLoreSection,
  searchLoreSections,
  scheduleLoreRefresh,
} from '../api/wiki/data.js'
import { fetchSuitSets, enrichSuitSets, buildAccessoryAtlasContext } from '../api/wiki/suitSet.js'
import { fetchIconModule } from '../api/wiki/luaModule.js'
import initUI from './UI.js'
import { clearRenderCache } from './renderCache.js'

const SPIRIT_HERO_SUFFIXES = ['专属灵子图鉴', '专武图鉴', '专属灵子', '专武']

export function parseSpiritHeroQuery(query = '') {
  const q = String(query).trim()
  for (const suffix of SPIRIT_HERO_SUFFIXES) {
    if (q.endsWith(suffix)) {
      const heroName = q.slice(0, -suffix.length).trim()
      if (heroName) return heroName
    }
  }
  return null
}

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
    this.accessoryIds = {}
    this.suits = setting.getData('data/game/suit', []) // 套装列表

    /** BWIKI 背景 / 资料合集（data/game/lore/*.yaml） */
    this.lore = loadAllLorePages()

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

  normalizeGetDataMode(arg) {
    if (typeof arg === 'object' && arg !== null) {
      return arg.mode || 'refresh'
    }
    if (typeof arg === 'boolean') {
      return arg ? 'init' : 'refresh'
    }
    return 'refresh'
  }

  /** @param {{ mode?: 'init'|'refresh' }|boolean} [arg] */
  async getData(arg) {
    const mode = this.normalizeGetDataMode(arg)
    if (!this.getUI) {
      this.getUI = initUI.call(this)
    }
    const loaders = [
      this.getBaseData,
      this.getHeroData,
      this.getPetData,
      this.getSpiritData,
      this.getAccessoryData,
      this.getItemData,
      this.getLoreData,
    ]
    for (const fn of loaders) {
      try {
        await fn.call(this, mode)
      } catch (err) {
        logger.error(`[yoyo-plugin][game] ${fn.name} 失败`, err)
      }
    }
    if (mode === 'refresh') clearRenderCache()
    this.scheduleUIDownload()
    scheduleLoreRefresh()
  }

  /** BWIKI 背景页：普罗米利亚、游戏信息整理合集 */
  async getLoreData(mode = 'init') {
    const cacheMissing = !fs.existsSync(path.join(setting.path, 'data/game/lore'))
      || !fs.readdirSync(path.join(setting.path, 'data/game/lore')).some(f => f.endsWith('.yaml') && f !== 'index.yaml')
    if (mode === 'refresh' || cacheMissing) {
      this.lore = await refreshLoreCache({ mode })
    } else {
      this.lore = loadAllLorePages()
    }
    return this.lore
  }

  getLorePage(slug) {
    return this.lore?.[slug] || loadLorePage(slug)
  }

  findLoreSection(slug, sectionQuery) {
    return getLoreSection(slug, sectionQuery)
  }

  searchLore(query, options) {
    return searchLoreSections(query, options)
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
    this.petIds = buildKiboPetIds(this.pets)
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
    this.accessoryIds = (Array.isArray(this.accessories) ? this.accessories : Object.values(this.accessories))
      .reduce((ids, { id, name }) => {
        if (name) ids[name] = id
        return ids
      }, {})

    const suitCacheMissing = !this.dataFileExists('data/game/suit')
    const suitEmpty = !this.suits?.length
    if (this.shouldFetchWiki(mode, suitEmpty, suitCacheMissing)) {
      try {
        this.suits = await fetchSuitSets()
        setting.setData('data/game/suit', this.suits)
      } catch (error) {
        logger.error('[yoyo-plugin][game] 套装数据拉取失败', error)
      }
    } else {
      this.suits = setting.getData('data/game/suit', this.suits)
    }
    return this.accessories
  }

  getSuitSets() {
    return enrichSuitSets(this.suits, this.accessories)
  }

  getAccessoryId(name) {
    if (!name) return null
    const list = Array.isArray(this.accessories) ? this.accessories : Object.values(this.accessories || {})
    const direct = list.find(item => String(item.id) === String(name))
    if (direct) return direct.id
    if (this.accessoryIds?.[name]) return this.accessoryIds[name]
    const matched = list.find(item => item.name === name || item.page === name)
    return matched?.id || null
  }

  getAccessory(idOrName) {
    const id = this.getAccessoryId(idOrName)
    if (!id) return null
    const list = Array.isArray(this.accessories) ? this.accessories : Object.values(this.accessories || {})
    return list.find(item => String(item.id) === String(id)) || null
  }

  enrichAccessoryAtlas(accessory) {
    return buildAccessoryAtlasContext(accessory, this.suits, this.accessories)
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
  isPublicPet(pet) {
    return !!pet?.id && !isKiboStorySpecial(pet)
  }
  getPublicPets() {
    return Object.values(this.pets).filter(
      pet => pet?.petIcon && String(pet.name || '').trim() && this.isPublicPet(pet)
    )
  }
  getPetId(name) {
    if (name in this.pets) {
      return this.isPublicPet(this.pets[name]) ? name : undefined
    }
    const id = this.petIds[name]
    return id && this.isPublicPet(this.pets[id]) ? id : undefined
  }
  getSpiritIdsByHeroSpiritQuery(query = '') {
    const heroName = parseSpiritHeroQuery(query)
    if (!heroName) return []
    const heroId = this.getHeroId(heroName)
    if (!heroId) return []
    const officialName = this.heros[heroId]?.name
    if (!officialName) return []
    return Object.values(this.spirits)
      .filter(spirit => spirit.relatedHero === officialName)
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map(spirit => spirit.id)
  }
  getSpiritId(name) {
    if (name in this.spirits) return name
    if (this.spiritIds[name]) return this.spiritIds[name]
    const ids = this.getSpiritIdsByHeroSpiritQuery(name)
    if (ids.length === 1) return ids[0]
  }
  getItemId(name) {
    if (name in this.items) return name
    return this.itemIds[name]
  }
  /**
   * 操作resource
   */
  normalizeImageBuffer(data, maxSize) {
    if (Buffer.isBuffer(data)) {
      if (data.length > maxSize) throw new Error('图片太大了')
      return data
    }
    if (typeof data === 'string') {
      if (data.startsWith('file://')) {
        const buf = fs.readFileSync(data.replace(/^file:\/\//, ''))
        if (buf.length > maxSize) throw new Error('图片太大了')
        return buf
      }
      if (data.startsWith('base64://')) {
        const buf = Buffer.from(data.replace(/^base64:\/\//, ''), 'base64')
        if (buf.length > maxSize) throw new Error('图片太大了')
        return buf
      }
    }
    return null
  }

  detectImageExt(val, buffer) {
    const sourceName = String(val?.filename || val?.file || val?.url || '')
    let fileType = 'jpg'
    if (sourceName.includes('.')) {
      fileType = sourceName.substring(sourceName.lastIndexOf('.') + 1).toLowerCase()
    }
    if (buffer?.[0] === 0x47 && buffer?.[1] === 0x49) fileType = 'gif'
    else if (buffer?.[0] === 0x89 && buffer?.[1] === 0x50) fileType = 'png'
    else if (buffer?.[0] === 0xff && buffer?.[1] === 0xd8) fileType = 'jpg'
    if (!['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fileType)) fileType = 'jpg'
    return fileType === 'jpeg' ? 'jpg' : fileType
  }

  async readHeroImageBuffer(val, maxSize, e) {
    if (Buffer.isBuffer(val?.file)) {
      return this.normalizeImageBuffer(val.file, maxSize)
    }

    const sources = []
    if (val?.file) sources.push(val.file)
    if (val?.url && val.url !== val.file) sources.push(val.url)

    let lastErr
    for (const source of sources) {
      try {
        if (typeof Bot !== 'undefined' && typeof Bot.Buffer === 'function') {
          const data = await Bot.Buffer(source, { size: maxSize })
          const buf = this.normalizeImageBuffer(data, maxSize)
          if (buf) return buf
        }
      } catch (err) {
        lastErr = err
        logger.debug(`[yoyo-plugin][game] Bot.Buffer(${source}) 失败: ${err.message}`)
      }
    }

    if (val?.url && e?.bot?.sendApi) {
      try {
        const result = await e.bot.sendApi('download_file', { url: val.url })
        const filePath = String(result?.file || result?.path || '').replace(/^file:\/\//, '')
        if (filePath && fs.existsSync(filePath)) {
          return this.normalizeImageBuffer(fs.readFileSync(filePath), maxSize)
        }
      } catch (err) {
        lastErr = err
        logger.debug(`[yoyo-plugin][game] download_file 失败: ${err.message}`)
      }
    }

    throw lastErr || new Error('未找到可用的图片数据')
  }

  async setHeroImgs(heroId, imageMessages, e) {
    let str = ''
    let imgCount = 0
    const heroImgRoot = path.join(setting.path, 'resources/img/hero', this.heros[heroId].name)
    const maxSize = 1024 * 1024 * (setting.config.imgMaxSize || 10)

    for (let val of imageMessages) {
      try {
        const buffers = await this.readHeroImageBuffer(val, maxSize, e)
        const fileType = this.detectImageExt(val, buffers)

        if (!fs.existsSync(heroImgRoot)) {
          fs.mkdirSync(heroImgRoot, { recursive: true })
        }

        const md5 = MD5(buffers)
        const newImgPath = path.join(heroImgRoot, `${md5}.${fileType}`)
        fs.writeFileSync(newImgPath, buffers)

        if (!this.heroImgs[heroId]) this.heroImgs[heroId] = []
        if (!this.heroImgs[heroId].includes(newImgPath)) {
          this.heroImgs[heroId].push(newImgPath)
        }
        str += `✅图片上传成功\n`
        imgCount++
      } catch (err) {
        logger.error('[yoyo-plugin][game] setHeroImgs 失败', err)
        str += `❌图片上传失败：${err.message}\n`
      }
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
