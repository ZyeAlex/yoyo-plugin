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
        const guideName = (match[2] || '').trim()
        if (!guideName) return true

        const folder = path.join(setting.path, 'resources', 'guide', guideName)
        if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
            e.reply(`未找到「${guideName}」攻略目录：resources/guide/${guideName}，可能名称不正确`)
            return true
        }

        const allFiles = fs.readdirSync(folder)
        const imageFiles = allFiles.filter(f => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f))
        if (imageFiles.length === 0) {
            e.reply(`「${guideName}」暂无攻略`)
            return true
        }

        const segs = imageFiles.map(file => {
            const full = path.join(folder, file).replace(/\\/g, '/')
            return segment.image(`file://${full}`)
        })

        // QQ 消息支持一次发送多张图，过多时可分批发送
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
}


