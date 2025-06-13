import setting from '#ap.setting'
import data from '#ap.data'
import axios from 'axios'

export class image extends plugin {
    // 图片缓存
    _img_cache = {}
    constructor() {
        super({
            name: '[悠悠]角色图片',
            dsc: '悠悠角色图片',
            event: 'message',
            priority: 100,
            rule: [
                {
                    reg: `^${setting.rulePrefix}?.{0,10}图片$`, 
                    fnc: 'getRoleImage'
                },
                {
                    reg: `^${setting.rulePrefix}随机图片$`,
                    fnc: 'getRandomRoleImage'
                }
            ]
        })
    }
    // 角色图片
    async getRoleImage(e) {
        // 从e.msg字符串里面匹配(\w)
        let roleName = e.msg.match(new RegExp(`^${setting.rulePrefix}?(.{0,10})图片$`))[1]
        // 查询是否有此角色
        roleName = data.getRoleName(roleName)
        if (!roleName) return
        e.reply(`正在从Pixiv获取${roleName}图片~`, false, { recallMsg: 5 })
        const img = await this.pixiv(roleName)
        // const img = await this.lolicon(roleName)

        if (img) {
            e.reply(segment.image(img))
            return false
        } else {
            e.reply('什么都没查到呢~')
            return true
        }
    }
    // 随机角色图片
    async getRandomRoleImage(e) {
        const roles = await data.getAllRole()

        e.reply('功能暂未开发')
        return true
    }


    // https://docs.api.lolicon.app/#/setu
    async lolicon(roleName, keyword = '蓝色星原') {
        if (!this._img_cache[roleName]?.length) {
            const res = await axios.get('https://api.lolicon.app/setu/v2', {
                params: {
                    num: 20,
                    tag: roleName,
                    keyword,
                    excludeAI: true,
                    r18: 0
                }
            })
            this._img_cache[roleName] = res.data?.data.map(({ urls: { original } }) => original)
            if (!this._img_cache[roleName]?.length) return
        }
        return this._img_cache[roleName][Math.floor(Math.random() * this._img_cache[roleName].length)]
    }


    /**
     * @param {string} tag 关键词
     */
    async pixiv(roleName) {
        if (!this._img_cache[roleName]?.length) {
            const params = {
                word: roleName,
                page: 1,
                order: "date_desc",
                tag: "蓝色星原"
                // search_ai_type:false
            }
            let res = await axios.get(`${setting.config.hibiAPI}/api/pixiv/search`, { params })
            // x_restrict   image_urls.large
            this._img_cache[roleName] = res.data?.illusts.filter(({ x_restrict }) => !x_restrict).map(({ image_urls: { large } }) => {
                const img = new URL(large)
                // 反代
                img.host = setting.config.pixivImageProxy
                return img.href
            })
            if (!this._img_cache[roleName]?.length) return
        }
        return this._img_cache[roleName][Math.floor(Math.random() * this._img_cache[roleName].length)]
    }
}
