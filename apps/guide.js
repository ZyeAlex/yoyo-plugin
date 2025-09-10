import setting from '#setting'
import path from 'path'
import fs from 'fs'
import render from '#render'

export class Guide extends plugin {
    constructor() {
        super({
            name: '[悠悠助手]攻略',
            event: 'message',
            priority: 105,
            rule: [
                {
                    reg: `^(${setting.rulePrefix}|悠悠|yy|yoyo)?(.{1,20})攻略$`,
                    fnc: 'sendGuideImages'
                },
                {
                    reg: `^(${setting.rulePrefix}|悠悠|yy|yoyo)?攻略帮助$`,
                    fnc: 'guideHelp'
                }
            ]
        })
    }

    async sendGuideImages(e) {
        const match = e.msg.match(new RegExp(`^(${setting.rulePrefix}|悠悠|yy|yoyo)?(.{1,20})攻略$`))
        if (!match) return true
        let guideName = (match[2] || '').trim()
        if (!guideName) return true

        let folder = path.join(setting.path, 'resources', 'guide', guideName)
        if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
            // 模糊匹配；候选词来自 data/hero/nickname.yaml
            let nicknameMap = setting.nicknames || {}
            if (!nicknameMap || Object.keys(nicknameMap).length === 0) {
                try {
                    const loaded = setting.getData('nickname', 'hero') || {}
                    if (loaded && typeof loaded === 'object') {
                        nicknameMap = loaded
                    }
                } catch (err) {
                    logger.error('[yoyo-plugin][nickname读取]', err)
                }
            }
            const candidates = Object.values(nicknameMap).flat().filter(Boolean)
            const best = this.#findBestMatch(guideName, candidates)
            if (best?.score >= 0.5 && best.value) {
                await e.reply(`未找到「${guideName}」攻略，或许名字应为：` + best.value)
                return true
            }
            await e.reply(`未找到「${guideName}」攻略`)
            return true
        }

        const allFiles = fs.readdirSync(folder)
        const imageFiles = allFiles.filter(f => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f))
        if (imageFiles.length === 0) {
            await e.reply(`未找到「${guideName}」攻略`)
            return true
        }

        const fileUrls = imageFiles.map(file => {
            const full = path.join(folder, file).replace(/\\/g, '/')
            return `file://${full}`
        })



        // 以转发消息发送
        const headerNode = {
            message: [`${guideName}攻略`],
            nickname: (e.bot?.nickname) || '[攻略]标题',
            user_id: e.self_id || e.bot?.uin || 0
        }
        const nodes = [headerNode, ...fileUrls.map(url => ({
            message: [segment.image(url)],
            nickname: (e.bot?.nickname) || '[攻略]图片',
            user_id: e.self_id || e.bot?.uin || 0
        }))]

        try {
            let forward
            if (e.group?.makeForwardMsg) {
                forward = await e.group.makeForwardMsg(nodes)
            } else if (e.friend?.makeForwardMsg) {
                forward = await e.friend.makeForwardMsg(nodes)
            }
            if (forward) {
                await e.reply(forward)
                return true
            }
        } catch (err) {
            logger.error('[yoyo-plugin][攻略转发失败]', err)
        }

        // 不支持转发时按批发送
        const segs = fileUrls.map(url => segment.image(url))
        const batchSize = 20
        for (let i = 0; i < segs.length; i += batchSize) {
            const batch = segs.slice(i, i + batchSize)
            await e.reply(batch)
        }
        return true
    }


    async guideHelp(e) {
        const guideRoot = path.join(setting.path, 'resources', 'guide')
        if (!fs.existsSync(guideRoot)) {
            return e.reply('未找到攻略目录 resources/guide')
        }
        const entries = fs.readdirSync(guideRoot, { withFileTypes: true })
        const guides = entries
            .filter(d => d.isDirectory() && d.name !== 'help')
            .map(d => {
                const folder = path.join(guideRoot, d.name)
                let count = 0
                try {
                    count = (fs.readdirSync(folder) || []).filter(f => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f)).length
                } catch { }
                return { name: d.name, count }
            })
            .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))

        return await render(e, 'guide/help/index', { guides })
    }




    // 计算字符串相似度（包含关系优先 + 编辑距离）
    #similarity(a, b) {
        const na = this.#normalize(a)
        const nb = this.#normalize(b)
        if (!na || !nb) return 0
        if (na === nb) return 1
        if (na.includes(nb) || nb.includes(na)) {
            const ratio = Math.min(na.length, nb.length) / Math.max(na.length, nb.length)
            return Math.max(0.6, ratio)
        }
        const dist = this.#levenshtein(na, nb)
        const maxLen = Math.max(na.length, nb.length)
        return 1 - dist / Math.max(1, maxLen)
    }

    #normalize(s) {
        return String(s).toLowerCase().replace(/[^\p{sc=Han}a-z0-9]/giu, '')
    }

    #levenshtein(a, b) {
        const m = a.length, n = b.length
        const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
        for (let i = 0; i <= m; i++) dp[i][0] = i
        for (let j = 0; j <= n; j++) dp[0][j] = j
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + cost
                )
            }
        }
        return dp[m][n]
    }

    #findBestMatch(target, candidates) {
        let best = { value: null, score: 0 }
        for (const c of candidates) {
            const s = this.#similarity(target, c)
            if (s > best.score) best = { value: c, score: s }
        }
        return best
    }
}

