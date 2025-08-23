import setting from '#setting'
import render from '#render'
import lodash from 'lodash'
// type   skill voice

export class Pet extends plugin {
    constructor() {
        super({
            name: '[悠悠小助手]图鉴',
            dsc: '悠悠图鉴',
            event: 'message',
            priority: 102,
            rule: [
                {
                    reg: `^(?!奇波图鉴)(?!角色图鉴)${setting.rulePrefix}?(.{1,10}?)(图鉴|卡片|card|Card)$`,
                    fnc: 'atlas'
                },
                {
                    reg: `^${setting.rulePrefix}?(.{1,10}?)((?:技能|星赐|台词|语音|文本)[\n+,，、]?)+(图鉴)?$`,
                    fnc: 'heroInfo'
                },
            ]
        })
    }

    atlas(e) {
        // 名称
        let name = e.msg.match(new RegExp(`^${setting.rulePrefix}?(.{1,10}?)(图鉴|卡片|card|Card)$`))[1]
        let heroId = setting.getHeroId(name)
        // 角色
        if (heroId) {
            return this.heroAtlas(e, heroId)
        }
        // 奇波
        if (setting.petIds[name]) {
            return this.petAtlas(e, setting.petIds[name])
        }
        return true
    }

    // 角色信息
    async heroInfo(e) {
        let reg = new RegExp(`^${setting.rulePrefix}?(.{1,10}?)((?:技能|星赐|台词|语音|文本)[\n+,，、]?)+(图鉴)?$`)
        let name = e.msg.match(reg)[1]
        let heroId = setting.getHeroId(name)
        if (!heroId) return true
        let config = []

        // 如果reg包含 技能
        // 如果reg 包含技能文本

        if (e.msg.includes('技能')) {
            config.push('skill')
        }
        if (e.msg.includes('星赐')) {
            config.push('talent')
        }
        // 台词|语音|文本
        if (e.msg.includes('语音') || e.msg.includes('台词') || e.msg.includes('文本')) {
            config.push('voice')
        }

        return this.heroAtlas(e, heroId, config)
    }

    // 角色图鉴
    async heroAtlas(e, heroId, type = ['skill', 'talent']) {
        // 角色信息
        let heroMsg = setting.heros[heroId] || {}
        heroMsg.skillSystem?.forEach(skill => {
            skill.skillDescribe = skill.skillDescribe.replace(/\\n/g, '<br/>').replace(/<color=(#\w+)>([^<]+)<\/color>/g, (_, color, text) => `<font color="${color}">${text}</font>`).replace(/\{(\d+)\}/g, (_, index) => (skill.skillLevel[9] || skill.skillLevel[0])?.value[index])
            // skill.skillLevel[9].value.forEach
        })
        return await render(e, 'hero/atlas', {
            ...heroMsg,
            type
        })
    }


    // 奇波图鉴
    async petAtlas(e, petId) {
        return await render(e, 'pet/atlas', setting.pets[petId])
    }

}