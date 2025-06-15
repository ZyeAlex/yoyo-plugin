import { httpfulfilledfulfilled } from '../utils/http.js'
import setting from '#utils.setting'




// https://docs.api.lolicon.app/#/setu

export const lolicon = (tag) => {
    return http.get('https://api.lolicon.app/setu/v2', {
        num: 20,
        tag,
        keyword: "蓝色星原",
        excludeAI: setting.config.excludeAI || true,
        r18: 0
    })
}

export const pixiv = (word) => {
    return http.get(`${setting.config.hibiAPI}/api/pixiv/search`, {
        word,
        page: 1,
        order: "date_desc",
        tag: "蓝色星原",
        search_ai_type: setting.config.excludeAI || true,
    })
}



