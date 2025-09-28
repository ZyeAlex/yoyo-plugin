import setting from '#setting'
import path from 'path'
import fs from 'fs'
import utils from '#utils'
import plugin from '#plugin'

export const Guide = plugin({
    name: '[悠悠助手]攻略',
    event: 'message',
    priority: 105,
    rule: [
        {
            reg: `^${setting.rulePrefix}?(.{1,10}?)攻略$`,
            fnc: guide
        }
    ]
})

async function guide(e, reg) {
    const guideName = e.msg.match(reg)[1]
    if (!guideName) return true
    // 角色
    let heroId = setting.getHeroId(guideName, false)
    if (heroId) {
        return heroGuide(e, heroId)
    }
    // 其他攻略


    // 模糊匹配
    let guideId = utils.findBestMatch(guideName, setting.heros)
    if (guideId) {
        await e.reply(`未找到「${guideName}」攻略，或许名字应为：` + setting.heros[guideId].name)
        return
    }
}

// 角色攻略
async function heroGuide(e, heroId) {
    const heroGuideImgs = getGuide('hero', heroId)
    if (!heroGuideImgs?.length) {
        await e.reply(`未找到「${guideName}」攻略`)
        return
    }
    sendGuide(e, setting.heros[heroId].name, heroGuideImgs)
}


// 获取攻略图片路径  本地 / 联网
function getGuide(type, id) {

    let files = []
    let paths = []


    // 本地路径
    paths.push(path.join(setting.path, '/resources/img/guide', type, id))
    // 挂载路径
    setting.config.guidePath.forEach(guidePath => {
        paths.push(path.join(setting.path, guidePath, type, id))
        paths.push(path.join(setting.path, guidePath, type, setting.heros[id].name))
    })

    paths.filter(p => fs.existsSync(p)).forEach(filePath => {
        fs.readdirSync(filePath).filter(f => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f)).forEach(file => {
            files.push(path.join(filePath, file))
        })
    })
    
    return files
}
// 发送攻略图片
async function sendGuide(e, guideName, guideImgs) {
    try {
        await e.reply(utils.makeForwardMsg(e, guideImgs.map(url => segment.image(url)), guideName + '攻略'))
    } catch (error) {
        // 不支持转发时按批发送
        const segs = guideImgs.map(url => segment.image(url))
        const batchSize = 3
        for (let i = 0; i < segs.length; i += batchSize) {
            const batch = segs.slice(i, i + batchSize)
            await e.reply(batch)
        }
    }
}



