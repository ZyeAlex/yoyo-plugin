import setting from '#setting'
import game from '#game'
import path from 'path'
import fs from 'fs'
import utils from '#utils'
import plugin from '#plugin'

export const Guide = plugin({
    name: '[悠悠助手]攻略',
    event: 'message',
    priority: 100,
    rule: [
        {
            reg: `^#?(.{1,10}?)攻略$`,
            fnc: guide
        }
    ]
})

async function guide(e, guideName) {
    if (!guideName) return true
    // 角色
    let heroId = game.getHeroId(guideName)
    if (heroId) {
        return heroGuide(e, heroId)
    }
    // 其他攻略
    return true
}

// 角色攻略
async function heroGuide(e, heroId) {
    const heroGuideImgs = getGuide('hero', heroId)
    if (!heroGuideImgs?.length) return true

    sendGuide(e, game.heros[heroId].name, heroGuideImgs)
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
        paths.push(path.join(setting.path, guidePath, type, game.heros[id].name))
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



