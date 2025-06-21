import setting from '#setting'
import lodash from 'lodash'
import img from '../components/img.js'
import runtimeRender from '../utils/runtime-render.js'

const imgReg = '(?:图片|照片|美图|美照)'
// 缓存角色面板图片列表,给delRoleImg用，防止出现删除过程中索引变动问题
const rolesImgs = {}

export class Img extends plugin {
    constructor() {
        super({
            name: '[悠悠小助手]图片',
            dsc: '悠悠角色图片',
            event: 'message',
            priority: 100,
            rule: [
                {
                    reg: `^${setting.rulePrefix}(上传|添加).{0,10}${imgReg}$`,
                    fnc: 'uploadRoleImg'
                },
                {
                    reg: `^${setting.rulePrefix}删除.{1,10}${imgReg}[0-9,， ]+$`,
                    fnc: 'delRoleImg'
                },
                {
                    reg: `^${setting.rulePrefix}?随机(角色)?${imgReg}$`,
                    fnc: 'getRandomRoleImg'
                },
                {
                    reg: `^${setting.rulePrefix}?(?<!上传|添加|随机(角色)?).{0,10}${imgReg}$`,
                    fnc: 'getRoleImg'
                },
                {
                    reg: `^${setting.rulePrefix}?.{1,10}${imgReg}(列表|表列|合集|集合)$`,
                    fnc: 'getRoleImgList'
                }
            ]
        })
    }

    // 角色图片
    async getRoleImg(e, roleName) {
        // 从e.msg字符串里面匹配(\w)
        if (!roleName) {
            roleName = e.msg.match(new RegExp(`^${setting.rulePrefix}?(.{1,10})${imgReg}$`))[1]
            // 查询是否有此角色
            roleName = setting.getRoleName(roleName)
        }
        if (!roleName) return true
        // 从Redis中获取角色图片列表
        let roleImgs = JSON.parse((await redis.get('yoyo:img:role:' + roleName)) || '[]')
        if (!roleImgs || roleImgs.length == 0) {
            roleImgs = setting.getRoleImgs(roleName)
            // 从pixiv获取图片
            if (setting.config.pixiv) {
                const msg = await e.reply(`正在从网络获取${roleName}图片~`, true)
                roleImgs = roleImgs.concat(await img.lolicon(roleName))
                e?.group?.recallMsg(msg?.data?.message_id)
            }
        }
        if (roleImgs.length == 0) {
            e.reply(`什么都没查到呢~\n请「>上传${roleName}图片」`)
            return
        }
        let index = Math.floor(Math.random() * roleImgs.length)
        let img_url = roleImgs[index]
        roleImgs.splice(index, 1)
        redis.set('yoyo:img:role:' + roleName, JSON.stringify(roleImgs))
        e.reply(segment.image(img_url))
    }
    // 角色图片列表
    async getRoleImgList(e) {
        // 从e.msg字符串里面匹配(\w)
        let roleName = e.msg.match(new RegExp(`^${setting.rulePrefix}?(.{1,10})${imgReg}列表$`))[1]
        // 查询是否有此角色
        roleName = setting.getRoleName(roleName)
        if (!roleName) return true
        rolesImgs[roleName] = setting.getRoleImgs(roleName)
        e.reply('正在查询角色' + roleName + '图片列表，请稍后...', true)
        if (!rolesImgs[roleName]?.length) {
            e.reply(`什么都没查到呢~\n请「>上传${roleName}图片」`)
            return
        }
        return await runtimeRender(e, 'role/imgs', {
            roleName,
            roleImgs: rolesImgs[roleName].map(roleImg => roleImg.split('/resources')[1]),
        })
    }
    // 随机角色图片
    async getRandomRoleImg(e) {
        const roles = await setting.getAllRole()
        if (roles.length == 0) {
            e.reply('没有角色呢~')
            return false
        }
        // lodash 随机选一个
        this.getRoleImg(e, lodash.sample(roles))
    }
    // 上传角色图片
    async uploadRoleImg(e) {
        // 从e.msg字符串里面匹配(\w)
        let roleName = e.msg.match(new RegExp(`^${setting.rulePrefix}?(?:上传|添加)(.{0,10})${imgReg}$`))[1]
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
        e.reply(await setting.setRoleImgs(roleName, imgs))
        e?.group?.recallMsg(msg?.data?.message_id)
    }
    // 删除角色图片
    async delRoleImg(e) {
        // 从e.msg字符串里面匹配(\w)
        let [_, roleName, select] = e.msg.match(new RegExp(`^${setting.rulePrefix}?删除(.{1,10})${imgReg}([0-9,， ]+)$`))
        // 查询是否有此角色
        roleName = setting.getRoleName(roleName)
        if (!roleName) {
            return e.reply('未找到此角色', true)
        }
        if (!rolesImgs[roleName]?.length) {
            e.reply(`未获取到角色图片列表，请先「>${roleName}图片列表」`)
        }
        if (!select) return
        select = select.trim().split(/[,， ]/).sort((a, b) => b - a)
        let imgFiles = select.map(index => rolesImgs[roleName][index - 1])
        const res = setting.delRoleImg(roleName, imgFiles)
        if (res) {
            e.reply(`${roleName}图片${select.toString()}已删除`)
        }
    }
}
