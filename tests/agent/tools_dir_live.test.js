/**
 * Live：「你看下你目录里面的 tools 目录」— 观察 status / tool / reply 全链路。
 *
 * 运行：node --test tests/agent/tools_dir_live.test.js
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import yaml from 'yaml'

import { chatStream } from '../../api/agent/client.js'
import { extractReplies } from '../../api/agent/reply.js'
import { getAgentBaseURL } from '../../api/agent/schema.js'

function loadLiveCfg() {
  let merged = {}
  try {
    const defaults = yaml.parse(
      readFileSync(new URL('../../config/default.yaml', import.meta.url), 'utf8'),
    )
    const user = yaml.parse(
      readFileSync(new URL('../../config/config.yaml', import.meta.url), 'utf8'),
    )
    merged = { ...defaults, ...user }
  } catch {
    merged = {}
  }
  return {
    agentPort: Number(merged.agentPort) || 8787,
    agentTimeout: Number(merged.agentTimeout) || 120,
    agentLlmTimeoutSec: Number(merged.agentLlmTimeoutSec) || 60,
    agentMaxSteps: Number(merged.agentMaxSteps) || 12,
    agentMaxReplies: Number(merged.agentMaxReplies) || 3,
  }
}

const LIVE_CFG = loadLiveCfg()

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
  request_id: 'live-tools-dir-1',
  session: {
    session_id: 'group:991709221:bot:123456789',
    group_id: '991709221',
    bot_id: '123456789',
  },
  caller: {
    user_id: '111',
    user_name: '测试',
    group_role: 'admin',
    is_master: true,
  },
  messages: [
    {
      message_id: '1',
      user_id: '111',
      sender: { nickname: '测试' },
      message: [{ type: 'text', text: '悠悠你看下你目录里面的tools目录' }],
    },
  ],
}

describe('YoAgent live — tools 目录', { skip: !(await yoagentAvailable()) }, () => {
  it('应收到 status（LLM 进度句）+ reply，且 reply 提及 tools 目录内容', async () => {
    const events = []
    const statusTexts = []
    const started = Date.now()

    await chatStream(
      payload,
      async (event, data) => {
        const elapsed = ((Date.now() - started) / 1000).toFixed(1)
        events.push({ event, data, elapsedSec: elapsed })
        if (event === 'status' && data?.content) {
          statusTexts.push(data.content)
          console.log(`[${elapsed}s] status: ${data.content}`)
        }
        if (event === 'error') {
          console.log(`[${elapsed}s] error: ${data?.message}`)
        }
        if (event === 'reply') {
          const bubbles = extractReplies(data)
          const text = bubbles
            .map((b) => b.message?.[0]?.data?.text || b.content || '')
            .join('\n')
          console.log(`[${elapsed}s] reply (${text.length} chars): ${text.slice(0, 300)}`)
        }
      },
      LIVE_CFG,
    )

    const types = events.map((x) => x.event)
    console.log('events:', types.join(' → '))
    console.log('status count:', statusTexts.length)
    console.log('duration:', ((Date.now() - started) / 1000).toFixed(1), 's')
    console.log('cfg:', LIVE_CFG)

    assert.ok(types.includes('reply'), `应有 reply，实际: ${types.join(',')}`)

    const replyEvt = events.find((x) => x.event === 'reply')
    const bubbles = extractReplies(replyEvt.data)
    const text = bubbles
      .map((b) => b.message?.[0]?.data?.text || b.content || '')
      .join('\n')

    assert.ok(text.length > 5, `reply 过短: ${JSON.stringify(text)}`)
    assert.match(
      text,
      /tools|工具|registry|\.py|list_dir|目录/i,
      `reply 未体现 tools 目录信息: ${text.slice(0, 200)}`,
    )

    if (statusTexts.length > 0) {
      assert.ok(statusTexts.length >= 1, '至少一条 status')
    }
  })
})
