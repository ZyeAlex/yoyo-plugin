import { createHttp } from '../utils/http.js'

// manju的API都是{code,data} 在这里直接返回data
const response = (res) => {
    if (res.code) return Promise.reject(res)
    else return res.data
}
const http = createHttp({ response })

/**
 * 扫码登录（模拟接口层）
 *
 * 说明：
 * 1) 这里先提供「接口形状」与「默认参数结构」；
 * 2) 后续你只需要把 URL 改成真实蛮啾网关即可；
 * 3) 当前命名与返回字段按“通用扫码流程”设计：
 *    - createQrTicket -> ticket/qrId/qrUrl
 *    - queryQrStatus -> status
 *    - exchangeQrToken -> token/session/cookie
 */

/** 创建扫码票据 */
export const createQrTicket = (payload = {}) => {
    return http.post('/auth/qr/create', {
        appId: payload.appId || 'yoyo-plugin',
        scene: payload.scene || 'login',
        // 设备指纹可后续替换成真实实现
        device: payload.device || '',
        ...payload,
    })
}

/** 查询扫码状态 */
export const queryQrStatus = (qrId, payload = {}) => {
    return http.get('/auth/qr/status', {
        qrId,
        ...payload,
    })
}

/** 扫码确认后，兑换登录态 */
export const exchangeQrToken = (qrId, payload = {}) => {
    return http.post('/auth/qr/exchange', {
        qrId,
        ...payload,
    })
}

/**
 * 可选：本地模拟轮询状态（不走网络）
 * 用于在没有后端时先联调 login.js 逻辑。
 */
export const mockQrStatusSequence = (() => {
    const stateMap = new Map()
    // 状态流：pending -> scanned -> confirmed
    const steps = ['pending', 'pending', 'scanned', 'confirmed']
    return (qrId) => {
        const index = stateMap.get(qrId) || 0
        const status = steps[Math.min(index, steps.length - 1)]
        stateMap.set(qrId, index + 1)
        return Promise.resolve({
            qrId,
            status,
            // 兼容常见后端字段
            ticketStatus: status,
            confirmed: status === 'confirmed',
        })
    }
})()

export default {
    createQrTicket,
    queryQrStatus,
    exchangeQrToken,
    mockQrStatusSequence,
}


