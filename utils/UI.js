/**
 * 从 BWIKI 下载 UI 图标到 resources/UI
 */

import path from 'path'
import fs from 'fs'
import https from 'https'
import { URL } from 'url'
import { getWikiImageUrl } from '../api/wiki/data.js'
import setting from './setting.js'
import utils from './index.js'


export default function () {
    const uiDir = path.join(setting.path, 'resources/UI')
    let UI = fs.existsSync(uiDir) ? fs.readdirSync(uiDir) : []
    let imgs = []
    const pattern = /^tex_[a-zA-Z0-9_]+\.(png|jpg|jpeg|gif)$/
    let logs = {}

    const { helpGroup } = setting.getData('config/help')

    const queueIcon = (name) => {
        if (typeof name === 'string' && pattern.test(name) && !imgs.includes(name)) {
            imgs.push(name)
        }
    }

    const traverse = (current, visited = new WeakSet()) => {
        if (current === null || typeof current !== 'object') return
        if (visited.has(current)) return
        visited.add(current)
        if (Array.isArray(current)) {
            for (let i = 0; i < current.length; i++) {
                if (typeof current[i] === 'string') {
                    queueIcon(current[i])
                } else if (typeof current[i] === 'object') {
                    traverse(current[i], visited)
                }
            }
            return
        }
        for (const key in current) {
            if (!Object.prototype.hasOwnProperty.call(current, key)) continue
            if (typeof current[key] === 'string') {
                queueIcon(current[key])
            } else if (typeof current[key] === 'object') {
                traverse(current[key], visited)
            }
        }
    }

    const collectSources = () => {
        const heroPortraits = {}
        Object.entries(this.heros || {}).forEach(([id, hero]) => {
            heroPortraits[id] = hero.portraitIcon || `tex_icon_hero_get_${id}.png`
        })
        return {
            helpGroup,
            element: this.element,
            groups: this.groups,
            profession: this.profession,
            heros: this.heros,
            heroPortraits,
            pets: this.pets,
            spirits: this.spirits,
            items: this.items,
            accessories: this.accessories,
        }
    }

    const getImgUrl = async (imgName) => {
        try {
            const url = await getWikiImageUrl(imgName)
            if (!url) throw new Error('empty url')
            return url
        } catch {
            throw `[wiki] ❌️ 未从Wiki查询到图片：${imgName}`
        }
    }

    const preDownImg = (imgName, imgUrl) => {
        const filePath = path.join(uiDir, imgName)
        const download = (url, redirect = 0) => new Promise((resolve, reject) => {
            if (redirect > 5) return reject(`❌️ ${imgName} 重定向过多`)
            https.get(url, (response) => {
                if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
                    const location = response.headers.location
                    if (!location) {
                        return reject(`[${response.statusCode}] ❌️ ${imgName}下载失败`)
                    }
                    response.resume()
                    return download(new URL(location, url).href, redirect + 1).then(resolve).catch(reject)
                }
                if (response.statusCode != 200) {
                    return reject(`[${response.statusCode}] ❌️ ${imgName}下载失败`)
                }
                const file = fs.createWriteStream(filePath)
                response.pipe(file)
                file.on('finish', () => file.close(() => resolve()))
                file.on('error', (err) => {
                    fs.unlink(filePath, () => { })
                    reject(` ❌️ ${err}`)
                })
            }).on('error', (err) => {
                fs.unlink(filePath, () => { })
                reject(` ❌️ ${err}`)
            })
        })
        return download(imgUrl)
    }

    const getImg = async (obj) => {
        traverse(obj || collectSources.call(this))
        const pending = imgs.filter(name => !fs.existsSync(path.join(uiDir, name)))
        imgs.length = 0
        pending.forEach(queueIcon)
        if (!imgs.length) return

        let downloaded = 0
        while (imgs.length) {
            const imgName = imgs.shift()
            if (fs.existsSync(path.join(uiDir, imgName))) {
                if (!UI.includes(imgName)) UI.push(imgName)
                continue
            }
            try {
                const imgUrl = await getImgUrl(imgName)
                await preDownImg(imgName, imgUrl)
                if (!UI.includes(imgName)) UI.push(imgName)
                downloaded++
            } catch (error) {
                logs[imgName] = [...(logs[imgName] || []), error]
            }
            await utils.sleep(500)
        }

        setting.setData('data/logs/ui-logs', logs)
        if (downloaded > 0) {
            redis.set('yoyo:ui', new Date().toJSON())
        }
    }
    this.getImg = getImg
    return getImg
}
