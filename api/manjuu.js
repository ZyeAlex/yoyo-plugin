import { createHttp } from '../utils/http.js'

// manju的API都是{code,data} 在这里直接返回data
const response = (res) => {
    if (res.code) return Promise.reject(res)
    else return res.data
}
const http = createHttp({ response })

/**
 * 订阅人数
 * @returns 
 */
export const bookingnum = () => {
    return http.get('https://api-grp.manjuu.com/passportv2/web/booking/bookingnum', {}, {
        headers: { Sign: '360dc1f2307d34145bd9a2e7144e1365', Timestamp: 1749898714675 },
    })
}
/**
 * 官方动态
 * @param {*} type latest | news | notice | activity
 * @returns 
 */
export const announce = (type) => {
    return http.get('https://api-grp.manjuu.com/announce/client/announce/pagelist', { type, pageSize: 5, page: 1 })
}



