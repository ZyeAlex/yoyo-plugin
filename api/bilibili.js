import { http } from '../utils/http.js'
import setting from '#setting'


// 获取用户信息
export const getUserInfo = (uid) =>  http.get(`https://hibi.Yunzai-Bot.com/api/bilibili/v3/user_info`, { uid })
// 获取视频信息
export const getVideoInfo = (bvid) =>  http.get(`https://api.bilibili.com/x/web-interface/wbi/view`, { bvid })
// 获取视频在线人数
export const getVideoOnline = (bvid,cid) =>  http.get(`https://api.bilibili.com/x/player/online/total`, { bvid,cid })

