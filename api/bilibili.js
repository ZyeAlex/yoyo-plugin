import { http } from '../utils/http.js'
import setting from '#setting'


// 获取用户信息
export const getUserInfo = (uid) => {
    return http.get(`${setting.config.hibiAPI}/api/bilibili/v3/user_info`, { uid })
}
// 获取视频信息
export const getVideoInfo = (bvid) => {
    return http.get(`https://api.bilibili.com/x/web-interface/wbi/view`, { bvid })
}


