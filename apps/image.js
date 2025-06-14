import setting from '#utils.setting'
import data from '#utils.data'
import axios from 'axios'
// 图片缓存
const _img_cache = {}
export class image extends plugin {

    constructor() {
        super({
            name: '[悠悠小助手]角色图片',
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
        // 从   await this.pixiv(roleName) 和 await this.lolicon(roleName) 获取图片列表，将成功返回列表的放进 _img_cache[roleName]
        if (!_img_cache[roleName] || _img_cache[roleName].length == 0) {
            e.reply(`正在从Pixiv获取${roleName}图片~`, false, { recallMsg: 5 })
            _img_cache[roleName] = await Promise.all([...await this.pixiv(roleName), ...await this.lolicon(roleName)])
        }
        if (_img_cache[roleName].length == 0) {
            e.reply('什么都没查到呢~')
        }
        let index = Math.floor(Math.random() * _img_cache[roleName].length)
        let img = _img_cache[roleName][index]
        _img_cache[roleName].splice(index, 1)
        e.reply(segment.image(img))

    }
    // 随机角色图片
    async getRandomRoleImage(e) {
        const roles = await data.getAllRole()

        e.reply('功能暂未开发')
        return true
    }


    // https://docs.api.lolicon.app/#/setu
    async lolicon(roleName, keyword = '蓝色星原') {
        try {
            const res = await axios.get('https://api.lolicon.app/setu/v2', {
                params: {
                    num: 20,
                    tag: roleName,
                    keyword,
                    excludeAI: true,
                    r18: 0
                }
            })
            return res.data?.data.map(({ urls: { original } }) => original) || []
        } catch (error) {
            return []
        }
    }


    /**
     * @param {string} tag 关键词
     */
    async pixiv(roleName) {
        const params = {
            word: roleName,
            page: 1,
            order: "date_desc",
            tag: "蓝色星原"
            // search_ai_type:false
        }
        try {
            let res = await axios.get(`${setting.config.hibiAPI}/api/pixiv/search`, { params })
            logger.info(res.data?.illusts?.[0])

            // x_restrict   image_urls.large
            return res.data?.illusts.filter(({ x_restrict }) => !x_restrict).map(({ image_urls: { large } }) => {
                const img = new URL(large)
                // 反代
                img.host = setting.config.pixivImageProxy
                return img.href
            }) || []
        } catch (error) {
            return []
        }
    }
}
