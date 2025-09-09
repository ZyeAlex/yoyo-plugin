import setting from '#setting'
import render from '#render'
import utils from '#utils'
import lodash from 'lodash'
import common from '../../../lib/common/common.js'
const imgReg = '(?:图片|照片|美图|美照)'
// 缓存角色面板图片列表,给delHeroImg用，防止出现删除过程中索引变动问题
const cacheHeroImgs = {}

export class Img extends plugin {
    constructor() {
        super({
            name: '[悠悠助手]图片',
            event: 'message',
            priority: 104,
            rule: [
                {
                    reg: `^${setting.rulePrefix}?(?:上传|添加)(.{0,10})${imgReg}$`,
                    fnc: 'uploadHeroImg'
                },
                {
                    reg: `^${setting.rulePrefix}?删除(.{1,10}?)${imgReg}([0-9,， ]+)$`,
                    fnc: 'delHeroImg'
                },
                {
                    reg: `^${setting.rulePrefix}?随机(角色)?${imgReg}$`,
                    fnc: 'getRandomHeroImg'
                },
                {
                    reg: `^${setting.rulePrefix}?(?!上传|添加|随机(角色)?).{0,10}${imgReg}[0-9]*$`,
                    fnc: 'getHeroImg'
                },
                {
                    reg: `^${setting.rulePrefix}?.{1,10}${imgReg}(列表|表列|合集|集合)$`,
                    fnc: 'getHeroImgList'
                }
            ]
        })
    }

    // 角色图片
    async getHeroImg(e, heroId, heroIndex) {
        // 从e.msg字符串里面匹配(\w)
        if (!heroId) {
            let _, heroName
            [_, heroName, heroIndex] = e.msg.match(new RegExp(`^${setting.rulePrefix}?(.{1,10}?)${imgReg}([0-9]*)$`))
            // 查询是否有此角色
            heroId = setting.getHeroId(heroName)
        }
        if (!heroId) return true
        // 当前角色图片
        let heroImg = setting.heroImgs[heroId]
        if (heroImg.length == 0) {
            await common.sleep(500)
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
    async getHeroImgList(e) {
        // 从e.msg字符串里面匹配(\w)
        let heroName = e.msg.match(new RegExp(`^${setting.rulePrefix}?(.{1,10}?)${imgReg}列表$`))[1]
        // 查询是否有此角色
        let heroId = setting.getHeroId(heroName)
        if (!heroId) return true
        let heroImgs = [...(setting.heroImgs[heroId] || [])]
        cacheHeroImgs[heroId] = heroImgs
        e.reply('正在查询角色' + heroName + '图片列表，请稍后...', true)
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
    // 随机角色图片
    async getRandomHeroImg(e) {
        const heroIds = Object.keys(setting.heros)
        if (heroIds.length == 0) {
            e.reply('没有角色呢~')
            return false
        }
        // lodash 随机选一个
        this.getHeroImg(e, lodash.sample(heroIds))
    }
    // 上传角色图片
    async uploadHeroImg(e) {
        // 从e.msg字符串里面匹配(\w)
        let heroName = e.msg.match(new RegExp(`^${setting.rulePrefix}?(?:上传|添加)(.{0,10})${imgReg}$`))[1]
        // 查询是否有此角色
        let heroId = setting.getHeroId(heroName)
        if (!heroId) {
            return e.reply('未找到此角色')
        }
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
    // 删除角色图片
    async delHeroImg(e) {
        // 从e.msg字符串里面匹配(\w)
        let [_, heroName, select] = e.msg.match(new RegExp(`^${setting.rulePrefix}?删除(.{1,10}?)${imgReg}([0-9,， ]+)$`))
        // 查询是否有此角色
        let heroId = setting.getHeroId(heroName)
        if (!heroId) {
            return e.reply('未找到此角色', true)
        }
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
}
