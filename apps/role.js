import setting from '#setting'
import render from '#render'
import lodash from 'lodash'
export class Role extends plugin {
    constructor() {
        super({
            name: '[悠悠小助手]角色',
            dsc: '悠悠角色',
            event: 'message',
            priority: 101,
            rule: [
                {
                    reg: `^${setting.rulePrefix}?(角色列表|全部角色|所有角色)$`,
                    fnc: 'roleList'
                },
                {
                    reg: `^${setting.rulePrefix}?.{1,10}设置(别名|昵称|称号|外号).{1,10}$`,
                    fnc: 'setNickname'
                },
                {
                    reg: `^${setting.rulePrefix}?.{1,10}删除(别名|昵称|称号|外号).{1,10}$`,
                    fnc: 'delNickname'
                },
                {
                    reg: `^${setting.rulePrefix}?设置老婆.{1,10}$`,
                    fnc: 'setWife'
                },
                {
                    reg: `^${setting.rulePrefix}?删除老婆.{1,10}$`,
                    fnc: 'delWife'
                },
            ]
        })
    }
    // 角色列表
    async roleList(e) {
        return await render(e, 'role/list', {
            roleImg: lodash.sample(setting.getRoleImgs(lodash.sample(Object.keys(setting.roles))))?.split('/resources')[1],
            roles: Object.entries(setting.roles).map(([roleName, roleMsg]) => {
                let obj = {
                    roleName,
                    ...roleMsg
                }
                if (roleMsg.icon) {
                    try {
                        obj.icon = roleMsg.icon.map(item => item - 1)
                    } catch (error) {
                        obj.icon = roleMsg.icon.split(',').map(item => item - 1)
                    }
                } else {
                    obj.roleImg = lodash.sample(setting.getRoleImgs(roleName))?.split('/resources')[1]
                }
                return obj
            })
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
    // 设置老婆
    setWife(e) {

    }
    // 删除老婆
    delWife(e) {

    }
}