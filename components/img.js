import { lolicon } from '../api/img.js'
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
}

export default new Img()