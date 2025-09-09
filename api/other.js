import { http } from '../utils/http.js'

// 每日一言
export const hitokoto = () => http.get('https://v1.hitokoto.cn/?c=a&c=b&c=c')