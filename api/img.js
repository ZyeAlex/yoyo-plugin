import setting from '#setting'
import { http } from '../utils/http.js'



// https://docs.api.lolicon.app/#/setu

export const lolicon = (tag, keyword = "蓝色星原") => http.get('https://api.lolicon.app/setu/v2', {
    num: 20,
    tag,
    keyword,
    excludeAI: setting.config.excludeAI || true,
    r18: 0
})





