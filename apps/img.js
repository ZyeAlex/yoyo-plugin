import setting from '#setting'
import render from '#render'
import utils from '#utils'
import lodash from 'lodash'
import plugin from '#plugin'

const imgReg = '(?:图片|照片|美图|美照)'
export const Img = plugin({
    name: '[悠悠助手]图片',
    event: 'message',
    priority: -1,
    rule: [
        {
            reg: `^#?(?:上传|添加)(.{0,10})${imgReg}$`,
            fnc: uploadHeroImg
        },
        {
            reg: `^#?删除(.{1,10}?)${imgReg}([0-9,， ]+)$`,
            fnc: delHeroImg
        },
        {
            reg: `^#?(?!上传|添加|随机(?!角色)?)(.{0,10})${imgReg}([0-9]{0,4})$`,
            fnc: getHeroImg
        },
        {
            reg: `^#?(.{1,10})${imgReg}(列表|表列|合集|集合)$`,
            fnc: getHeroImgList
        },
        {
            reg: `^#?(查看)?原图$`,
            fnc: originalPic
        }
    ]
})


// 缓存角色面板图片列表,给delHeroImg用，防止出现删除过程中索引变动问题
const cacheHeroImgs = {}


// 角色图片
async function getHeroImg(e, reg) {
    let [_, heroName, heroIndex] = e.msg.match(reg)
    // 查询是否有此角色
    let heroId = setting.getHeroId(heroName)
    if (!heroId) return true
    // 当前角色图片
    let heroImg = setting.heroImgs[heroId]
    if (heroImg.length == 0) {
        e.reply(`什么都没查到呢~\n请「>上传${heroName}图片」`)
        return
    }
    let img_url
    if (heroIndex > 0 && cacheHeroImgs[heroId]?.length && cacheHeroImgs[heroId][heroIndex - 1]) {
        img_url = cacheHeroImgs[heroId][heroIndex - 1]
    } else {
        heroIndex = lodash.random(0, heroImg.length - 1)
        img_url = heroImg[heroIndex]
        heroImg.splice(heroIndex, 1)
    }
    e.reply(segment.image(img_url))
}
// 角色图片列表
async function getHeroImgList(e, reg) {
    // 从e.msg字符串里面匹配(\w)
    let heroName = e.msg.match(reg)[1]
    // 查询是否有此角色
    let heroId = setting.getHeroId(heroName)
    if (!heroId) return true
    let heroImgs = [...(setting.heroImgs[heroId] || [])]
    cacheHeroImgs[heroId] = heroImgs
    await e.reply('正在查询角色' + heroName + '图片列表，请稍后...', true)
    if (!heroImgs.length) {
        e.reply(`什么都没查到呢~\n请「>上传${heroName}图片」`)
        return
    }
    return await render(e, 'hero/imgs', {
        heroName,
        heroImgs,
        color: setting.heros[heroId]?.element?.elementColor || '#000000',
    })
}


// 删除角色图片
async function delHeroImg(e, reg) {
    // 从e.msg字符串里面匹配(\w)
    let [_, heroName, select] = e.msg.match(reg)
    // 查询是否有此角色
    let heroId = setting.getHeroId(heroName)
    if (!heroId) return ture
    if (!cacheHeroImgs[heroId]?.length) {
        e.reply(`未获取到角色图片列表，请先「>${heroName}图片列表」`)
    }
    if (!select) return
    // 权限检测
    utils.checkPermission(e, setting.config.imgDelAuth)
    select = select.trim().split(/[,， ]/).sort((a, b) => b - a)
    let imgFiles = select.map(index => cacheHeroImgs[heroId][index - 1])
    const res = setting.delHeroImg(heroId, imgFiles)
    if (res) {
        e.reply(`${heroName}图片${select.toString()}已删除`)
    }
}


// 获取原图
async function originalPic(e) {
    let source
    if (e.reply_id) {
        source = { message_id: e.reply_id }
    } else {
        if (!e.hasReply && !e.source) {
            return true
        }
        // 引用的消息不是自己的消息
        if (e.source.user_id !== e.self_id) {
            return true
        }
        // 获取原消息
        if (e.group?.getChatHistory) {
            logger.info(await e.group.getChatHistory(e.source.seq, 1))
            source = (await e.group.getChatHistory(e.source.seq, 1)).pop()
        } else if (e.friend?.getChatHistory) {
            source = (await e.friend.getChatHistory(e.source.time, 1)).pop()
        }
        // 引用的不是纯图片
        if (!(source?.message?.length === 1 && source?.message[0]?.type === 'image')) {
            return true
        }
    }
    if (source?.message_id) {
        let imgPath = await redis.get(`yoyo:original-picture:${source.message_id}`)
        if (!e.isMaster) {
            // e.reply('已禁止获取原图...')
            // return true
        }
        if (imgPath) {
            e.reply(segment.image(imgPath), false, { recallMsg: 30 })
            return
        }
    }

    return true

}


// 上传角色图片
async function uploadHeroImg(e, reg) {
    // 从e.msg字符串里面匹配(\w)
    let heroName = e.msg.match(reg)[1]
    // 查询是否有此角色
    let heroId = setting.getHeroId(heroName)
    if (!heroId) return true // 本插件不处理
    // 权限检测
    utils.checkPermission(e, setting.config.imgUpAuth)
    let imgs = []
    for (let val of e.message) {
        logger.info(val)
        if (val.type === 'image') {
            imgs.push(val)
        }
    }
    if (imgs.length === 0) {
        let source
        if (e.getReply) {
            source = await e.getReply()
        } else if (e.source) {
            if (e.group?.getChatHistory) {
                // 支持at图片添加，以及支持后发送
                source = (await e.group.getChatHistory(e.source?.seq, 1)).pop()
            } else if (e.friend?.getChatHistory) {
                source = (await e.friend.getChatHistory((e.source?.time + 1), 1)).pop()
            }
        }
        if (source) {
            for (let val of source.message) {
                if (val.type === 'image') {
                    imgs.push(val)
                } else if (val.type === 'xml' || val.type === 'forward') {// 支持合并转发消息内置的图片批量上传
                    let resid
                    try {
                        resid = val.data.match(/m_resid="(\d|\w|\/|\+)*"/)[0].replace(/m_resid=|"/g, '')
                    } catch (err) {
                        logger.error(err)
                        resid = val.id
                    }
                    if (!resid) break
                    let message = await e.bot.getForwardMsg(resid)
                    for (const item of message) {
                        for (const i of item.message) {
                            if (i.type === 'image') {
                                imgs.push(i)
                            }
                        }
                    }
                }
            }
        }
    }
    if (imgs.length <= 0) {
        e.reply('消息中未找到图片，请将要发送的图片与消息一同发送或引用要添加的图像..')
        return
    }
    // 保存图片
    const msg = e.reply([segment.at(e.user_id, lodash.truncate(e.sender.card, { length: 8 })), '\n正在上传图片，请稍候...'])
    e.reply(await setting.setHeroImgs(heroId, imgs))
    e?.group?.recallMsg(msg?.data?.message_id)
}
