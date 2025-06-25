import setting from '#setting'
import render from '#render'
import lodash from 'lodash'
export class Role extends plugin {
    constructor() {
        super({
            name: '[悠悠小助手]角色',
            dsc: '悠悠角色帮助',
            event: 'message',
            priority: 101,
            rule: [
                {
                    reg: `^${setting.rulePrefix}?(角色列表|全部角色|所有角色)$`,
                    fnc: 'roleList'
                },
                {
                    reg: `^${setting.rulePrefix}?.{1,10}(角色)?(图鉴|卡片|card|Card)$`,
                    fnc: 'roleCard'
                },
                {
                    reg: `^${setting.rulePrefix}?.{1,10}设置(别名|昵称|称号|外号).{1,10}$`,
                    fnc: 'setNickname'
                },
                {
                    reg: `^${setting.rulePrefix}?.{1,10}删除(别名|昵称|称号|外号).{1,10}$`,
                    fnc: 'delNickname'
                },
            ]
        })
    }
    // 角色列表
    roleList(e) {
        return e.reply(Object.keys(setting.roles).map((role, index) => ` ${index + 1}. ${role}`).join('\n'))
    }
    // 角色卡片
    async roleCard(e) {
        // 角色名
        let roleName = e.msg.match(new RegExp(`^${setting.rulePrefix}?(.{1,10})(角色)?(图鉴|卡片|card|Card)$`))[1]
        roleName = setting.getRoleName(roleName)
        if (!roleName) return true

        // 角色图片
        let roleImg = lodash.sample(setting.getRoleImgs(roleName))
        if (roleImg) {
            roleImg = roleImg.split('/resources')[1]
        } else {
            roleImg = ''
        }

        // 角色信息
        let roleMsg = setting.roles[roleName] || {}

        return await render(e, 'role/card', {
            roleName,
            roleImg,
            ...roleMsg
        })
    }
    // 设置角色别名
    setNickname(e) {
        let [_, roleName, nickname] = e.msg.match(new RegExp(`^${setting.rulePrefix}?(.{1,10})设置(?:别名|昵称|称号|外号)(.{1,10})$`))
        roleName = setting.getRoleName(roleName)
        if (!roleName) {
            return e.reply('未找到此角色')
        }
        if (nickname.length > 10) {
            return e.reply('昵称长度不能超过10位！')
        }
        const res = setting.setRoleNickname(roleName, nickname)
        return e.reply(res ? '别名设置成功' : '别名设置失败')
    }
    // 删除角色别名
    delNickname(e) {
        let [_, roleName, nickname] = e.msg.match(new RegExp(`^${setting.rulePrefix}?(.{1,10})删除(?:别名|昵称|称号|外号)(.{1,10})$`))
        roleName = setting.getRoleName(roleName)
        if (!roleName) {
            return e.reply('未找到此角色')
        }
        const res = setting.delRoleNickname(roleName, nickname)
        return e.reply(res ? '别名删除成功' : '别名删除失败')
    }
}