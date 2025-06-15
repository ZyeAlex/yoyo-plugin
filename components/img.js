import { lolicon, pixiv } from '../api/img.js'
import setting from '#setting'
class Img {
    // https://docs.api.lolicon.app/#/setu
    async lolicon(roleName) {
        try {
            const data = await lolicon(roleName)
            return data.data?.map(({ urls: { original } }) => original) || []
        } catch (error) {
            logger.error(error)
            return []
        }
    }
    async pixiv(roleName) {
        try {
            let data = await pixiv(roleName)
            // x_restrict   image_urls.large
            return data?.illusts.filter(({ x_restrict }) => !x_restrict).map(({ image_urls: { large } }) => {
                const img = new URL(large)
                // 反代
                img.host = setting.config.pixivImageProxy
                return img.href
            }) || []
        } catch (error) {
            logger.error(error)
            return []
        }
    }
}

export default new Img()