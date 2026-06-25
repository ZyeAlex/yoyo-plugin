import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isAgentTimeoutMessage, isServerAgentError, isTimeoutError, userReplyForFailure } from '../../api/agent/userReply.js'

describe('isServerAgentError', () => {
  it('识别 LLM 超时等服务端错误', () => {
    assert.equal(isServerAgentError(new Error('LLM 请求超时（>60s）')), true)
    assert.equal(isServerAgentError(new Error('network reset')), false)
  })
})

describe('userReplyForFailure', () => {
  it('已成功发送时不兜底', () => {
    assert.equal(userReplyForFailure({ sent: true }), null)
  })

  it('超时错误给出超时文案', () => {
    const err = new Error('Agent 执行超时（840s）')
    assert.match(userReplyForFailure({ error: err, sent: false }), /没来得及处理完/)
  })

  it('AbortError 给出超时文案', () => {
    const err = new Error('The operation was aborted')
    err.name = 'AbortError'
    assert.match(userReplyForFailure({ error: err, sent: false }), /没来得及处理完/)
  })

  it('同步 code!=0 的超时 message 给出超时文案', () => {
    assert.match(
      userReplyForFailure({ syncCode: 1, syncMessage: 'Agent 执行超时（840s）', sent: false }),
      /没来得及处理完/,
    )
  })

  it('仅有 started 无 reply 时说明未整理完', () => {
    assert.match(userReplyForFailure({ startedSent: true, sent: false }), /没整理完/)
  })

  it('SSE 未生成有效回复给出整理失败文案', () => {
    const err = new Error('Agent 未生成有效回复')
    err.code = 1
    assert.match(userReplyForFailure({ error: err, sent: false }), /没整理出完整回复/)
  })

  it('完全空回复仍用想不起来', () => {
    assert.equal(userReplyForFailure({ sent: false }), '唔…一时想不起来，稍后再问我吧')
  })
})

describe('isAgentTimeoutMessage', () => {
  it('识别服务端超时文案', () => {
    assert.equal(isAgentTimeoutMessage('Agent 执行超时（360s）'), true)
    assert.equal(isAgentTimeoutMessage('Agent 请求超时'), true)
  })
})

describe('isTimeoutError', () => {
  it('识别中文超时', () => {
    assert.equal(isTimeoutError(new Error('Agent 请求超时')), true)
  })
})
