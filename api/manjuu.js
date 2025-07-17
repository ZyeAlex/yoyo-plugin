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
export const bookingnum = () => http.get('https://api-grp.manjuu.com/passportv2/web/booking/bookingnum', {}, {
    headers: { Sign: '590fff07503c6862fd88da860dc1ef96', Timestamp: 1749993608796 },
})
/**
 * 官方动态
 * @param {*} type latest | news | notice | activity
 * @returns 
 */
export const announce = (type) => http.get('https://api-grp.manjuu.com/announce/client/announce/pagelist', { type, pageSize: 5, page: 1 })



export const announcePage = id => `https://azurpromilia.manjuu.com/announcement/${id}/`


