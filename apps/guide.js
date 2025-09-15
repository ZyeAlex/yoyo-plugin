import setting from '#setting'
import path from 'path'
import fs from 'fs'
import render from '#render'
import utils from '#utils'
import plugin from '#plugin'
export const Guide = plugin({
    name: '[悠悠助手]攻略',
    event: 'message',
    priority: 105,
    rule: [
        {
            reg: `^(${setting.rulePrefix}|悠悠|yy|yoyo)?(.{1,10}?)攻略$`,
            fnc: sendGuideImages
        },
        {
            reg: `^(${setting.rulePrefix}|悠悠|yy|yoyo)?攻略帮助$`,
            fnc: guideHelp
        }
    ]
})



async function sendGuideImages(e,reg) {
    const match = e.msg.match(reg)
    if (!match) return true
    let guideName = (match[2] || '').trim()
    if (!guideName) return true

    let folder = path.join(setting.path, 'resources', 'guide', guideName)
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
        const guideId = utils.findBestMatch(guideName, setting.nicknames)
        if (guideId) {
            await e.reply(`未找到「${guideName}」攻略，或许名字应为：` + setting.nicknames[String(guideId)][0])
            return
        }
        return true
    }
    const allFiles = fs.readdirSync(folder)
    const imageFiles = allFiles.filter(f => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f))
    if (imageFiles.length === 0) {
        await e.reply(`未找到「${guideName}」攻略`)
        return true
    }

    // 本地图片
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
        } else {
            logger.warn('[yoyo-plugin]当前环境不支持转发攻略，改为普通消息发送')
        }
    } catch (err) {
        logger.error('[yoyo-plugin][攻略转发失败]', err)
    }

    // 不支持转发时按批发送
    const segs = fileUrls.map(url => segment.image(url))
    const batchSize = 3
    for (let i = 0; i < segs.length; i += batchSize) {
        const batch = segs.slice(i, i + batchSize)
        await e.reply(batch)
    }
    return true
}


async function guideHelp(e) {
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



