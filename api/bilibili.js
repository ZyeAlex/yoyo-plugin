import fakeUa from 'fake-useragent'
import { createHttp } from '../utils/http.js'

const config = {
    headers: {
        "user-agent": fakeUa(),
    }
}

const http = createHttp({ config })



// 短链接
export const shortUrl = async (long_url) => {
    const res = await http.post(`https://api.bilibili.com/x/share/click`, {
        "build": Math.floor(Math.random() * (9000000 - 6000000 + 1)) + 6000000,
        "buvid": ('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')).sort(() => 0.5 - Math.random()).slice(0, 32).join('') + "infoc",
        "oid": long_url,
        "platform": ["android", "ios"][Math.floor(Math.random() * 2)],
        "share_channel": "COPY",
        "share_id": "public.webview.0.0.pv",
        "share_mode": Math.ceil(Math.random() * 10),
    })
    logger.info(res?.data?.content)
    logger.info(long_url)
    return res?.data?.content || long_url
}

// 获取用户信息
export const getUserInfo = (mid) => http.get(`https://api.bilibili.com/x/web-interface/card`, { mid })
// 获取视频信息
export const getVideoInfo = (bvid) => http.get(`https://api.bilibili.com/x/web-interface/wbi/view`, { bvid })
// 获取视频在线人数
export const getVideoOnline = (bvid, cid) => http.get(`https://api.bilibili.com/x/player/online/total`, { bvid, cid })

