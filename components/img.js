import { lolicon } from '../api/img.js'
class Img {
    // https://docs.api.lolicon.app/#/setu
    async lolicon(heroName) {
        try {
            const data = await lolicon(heroName)
            return data.data?.map(({ urls: { original } }) => original) || []
        } catch (error) {
            logger.error(error)
            return []
        }
    }
}

export default new Img()