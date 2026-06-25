/**
 * 对真实 YoAgent 的 SSE 集成测试（需本机 8787 已启动且 LLM 已配置）。
 *
 * 运行：node --test tests/agent/sse_live.test.js
 * 跳过：YoAgent 不可用时自动 skip
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { chatStream } from '../../api/agent/client.js'
import { extractReplies, sendReplies } from '../../api/agent/reply.js'
import { getAgentBaseURL } from '../../api/agent/schema.js'

const LIVE_CFG = {
  agentPort: 8787,
  agentTimeout: 180,
  agentLlmTimeoutSec: 60,
  agentMaxSteps: 4,
  agentMaxReplies: 3,
}

async function yoagentAvailable() {
  try {
    const res = await fetch(`${getAgentBaseURL(LIVE_CFG)}/api/health`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return false
    const body = await res.json()
    return body?.status === 'ok'
  } catch {
    return false
  }
}

const payload = {
  request_id: 'plugin-sse-live-1',
  session: {
    session_id: 'group:991709221:bot:123456789',
    group_id: '991709221',
    bot_id: '123456789',
  },
  messages: [
    {
      message_id: '1',
      user_id: '111',
      sender: { nickname: '测试' },
      message: [{ type: 'text', text: '悠悠搜一下蓝色星原' }],
    },
  ],
}

describe('YoAgent live SSE', { skip: !(await yoagentAvailable()) }, () => {
  it('stream=1 应收到 started + reply，reply 含蓝色星原', async () => {
    const events = []
    const e = { replies: [], reply: async (msg) => e.replies.push(msg) }

    await chatStream(
      payload,
      async (event, data) => {
        events.push({ event, data })
        if (event === 'started') return
        if (event === 'status' && data?.content) await e.reply(data.content)
        if (event === 'reply') await sendReplies(e, data, LIVE_CFG)
      },
      LIVE_CFG,
    )

    const types = events.map((x) => x.event)
    assert.ok(types.includes('started'), `应有 started，实际: ${types.join(',')}`)
    assert.ok(types.includes('reply'), `应有 reply，实际: ${types.join(',')}`)
    assert.ok(types.includes('status'), `走工具时应有一条 status，实际: ${types.join(',')}`)

    const replyEvt = events.find((x) => x.event === 'reply')
    const bubbles = extractReplies(replyEvt.data)
    const text = bubbles
      .map((b) => b.message?.[0]?.data?.text || b.content || '')
      .join('\n')

    assert.ok(text.length > 10, `reply 文本过短: ${JSON.stringify(text)}`)
    assert.match(text, /蓝色星原|旅谣|蛮啾|wiki/i, `reply 未含搜索内容: ${text.slice(0, 120)}`)
    assert.equal(e.replies.length, 2, `插件侧应恰好 2 条（status+结果），实际 ${e.replies.length}`)
  })
})
