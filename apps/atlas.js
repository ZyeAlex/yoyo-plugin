import setting from '#setting'
import render from '#render'
import lodash from 'lodash'
export class Qibo extends plugin {
    constructor() {
        super({
            name: '[悠悠小助手]图鉴',
            dsc: '悠悠图鉴',
            event: 'message',
            priority: 102,
            rule: [
                {
                    reg: `^${setting.rulePrefix}?.{1,10}(图鉴|卡片|card|Card)$`,
                    fnc: 'atlas'
                },
            ]
        })
    }

    atlas(e) {
        // 名称
        let name = e.msg.match(new RegExp(`^${setting.rulePrefix}?(.{1,10})(角色|奇波)?(图鉴|卡片|card|Card)$`))[1]
        // 角色
        if (setting.getRoleName(name)) {
            return this.roleAtlas(e, setting.getRoleName(name))
        }
        // 奇波
        if (setting.qibos[name]) {
            return this.qiboAtlas(e, name)
        }
        return true
    }
    // 角色图鉴
    async roleAtlas(e, roleName) {
        // 角色图片
        let roleImg = lodash.sample(setting.getRoleImgs(roleName))
        if (roleImg) {
            roleImg = roleImg.split('/resources')[1]
        } else {
            roleImg = ''
        }
        // 角色信息
        let roleMsg = setting.roles[roleName] || {}
        return await render(e, 'role/atlas', {
            roleName,
            roleImg,
            ...roleMsg
        })
    }

    // 奇波卡片
    async qiboAtlas(e, qiboName) {
        return await render(e, 'qibo/atlas', {
            ...setting.qibos[qiboName]
        })
    }
}