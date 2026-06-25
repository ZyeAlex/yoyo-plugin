/** Agent 失败/空回复时给用户看的短句 */

export function isTimeoutError(err) {
  if (!err) return false
  const msg = String(err.message || err)
  return err.name === 'AbortError' || /超时|timeout|timed out/i.test(msg)
}

export function isBusyError(err) {
  if (!err) return false
  return err.code === 'busy' || /仍在处理上一条|还在处理/.test(String(err.message || err))
}

export function isAgentTimeoutMessage(msg) {
  return /Agent 执行超时|Agent 请求超时|LLM 请求超时/i.test(String(msg || ''))
}

/** SSE/HTTP 已明确失败的服务端错误，不应再同步回退重跑（会抢 session 锁） */
export function isServerAgentError(err) {
  if (!err) return false
  const msg = String(err.message || err)
  if (isAgentTimeoutMessage(msg)) return true
  if (/未生成有效回复|LLM 未配置|Agent 返回错误|未知工具|PermissionDenied/i.test(msg)) return true
  if (err.code === 1) return true
  return false
}

/**
 * @param {{ error?: Error|null, startedSent?: boolean, statusSent?: boolean, sent?: boolean, syncCode?: number, syncMessage?: string }} ctx
 * @returns {string|null} 需要发给用户的文案；null 表示已成功发送无需兜底
 */
export function userReplyForFailure(ctx = {}) {
  const { error, sent, syncCode, syncMessage } = ctx
  const startedSent = ctx.startedSent ?? ctx.statusSent ?? false
  if (sent) return null

  const errMsg = error?.message || syncMessage || ''
  if (isTimeoutError(error) || isAgentTimeoutMessage(errMsg)) {
    return '思考时间有点长，这次没来得及处理完，稍后再问我吧~'
  }
  if (isBusyError(error)) {
    return '上一条还在处理中，稍等我一下~'
  }
  if (syncCode != null && syncCode !== 0) {
    if (isAgentTimeoutMessage(syncMessage)) {
      return '思考时间有点长，这次没来得及处理完，稍后再问我吧~'
    }
    if (/未生成有效回复/i.test(syncMessage || '')) {
      return '刚才没整理出完整回复，稍后再问我吧~'
    }
    return '刚才查资料出了点问题，稍后再试~'
  }
  if (/未生成有效回复/i.test(errMsg)) {
    return '刚才没整理出完整回复，稍后再问我吧~'
  }
  if (startedSent) {
    return '还在整理结果，没整理完，稍后再问我吧~'
  }
  return '唔…一时想不起来，稍后再问我吧'
}
