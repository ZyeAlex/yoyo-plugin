import setting from '#setting'
import lodash from 'lodash'
import img from '../components/img.js'
// 图片缓存
export class image extends plugin {

    constructor() {
        super({
            name: '[悠悠小助手]角色图片',
            dsc: '悠悠角色图片',
            event: 'message',
            priority: 100,
            rule: [
                {
                    reg: `^${setting.rulePrefix}(上传|添加).{0,10}(图片|照片|美图|美照|图)$`,
                    fnc: 'uploadRoleImage'
                },
                {
                    reg: `^${setting.rulePrefix}?(?<!上传|添加).{0,10}(图片|照片|美图|美照|图)$`,
                    fnc: 'getRoleImage'
                },
                {
                    reg: `^${setting.rulePrefix}随机(角色)?(图片|照片|美图|美照|图)$`,
                    fnc: 'getRandomRoleImage'
                }
            ]
        })
    }

    // 角色图片
    async getRoleImage(e) {
        // 从e.msg字符串里面匹配(\w)
        let roleName = e.msg.match(new RegExp(`^${setting.rulePrefix}?(.{0,10})(图片|照片|美图|美照|图)$`))[1]
        // 查询是否有此角色
        roleName = setting.getRoleName(roleName)
        if (!roleName) return
        // 从Redis中获取角色图片列表
        let roleImgs = JSON.parse((await redis.get('yoyo:img:role:' + roleName)) || '[]')
        if (!roleImgs || roleImgs.length == 0) {
            roleImgs = setting.getRoleImgs(roleName)
            const msg = await e.reply(`正在从Pixiv获取${roleName}图片~`, true)
            roleImgs = roleImgs.concat(await Promise.all([...await img.pixiv(roleName), ...await img.lolicon(roleName)]))
            e?.group?.recallMsg(msg?.data?.message_id)
        }
        if (roleImgs.length == 0) {
            e.reply('什么都没查到呢~')
        }
        let index = Math.floor(Math.random() * roleImgs.length)
        let img_url = roleImgs[index]
        roleImgs.splice(index, 1)
        redis.set('yoyo:img:role:' + roleName, JSON.stringify(roleImgs))
        e.reply(segment.image(img_url))

    }
    // 随机角色图片
    async getRandomRoleImage(e) {
        const roles = await setting.getAllRole()
        e.reply('功能暂未开发')
        return true
    }
    // 上传角色图片
    async uploadRoleImage(e) {
        // 从e.msg字符串里面匹配(\w)
        let roleName = e.msg.match(new RegExp(`^${setting.rulePrefix}(?:上传|添加)(.{0,10})(图片|照片|美图|美照|图)$`))[1]
        // 查询是否有此角色
        roleName = setting.getRoleName(roleName)
        if (!roleName) {
            return e.reply('未找到此角色')
        }
        let imgs = []
        for (let val of e.message) {
            if (val.type === 'image') {
                imgs.push(val)
            }
        }
        logger.info(imgs)
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
                    } else if (val.type === 'xml' || val.type === 'forward') {// 支持合并转发消息内置的图片批量上传，喵喵 喵喵喵？ 喵喵喵喵
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
        e.reply(await setting.setRoleImgs(roleName, imgs))
        e?.group?.recallMsg(msg?.data?.message_id)
    }
}
