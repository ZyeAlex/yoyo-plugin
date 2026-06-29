/**
 * yoyo-plugin 侧 SSE 单元测试：验证 chatStream 能收到 started + reply，且 sendReplies 能解析结果。
 *
 * 运行：node --test tests/agent/sse.test.js
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { chatStream, parseSseChunk } from '../../api/agent/client.js'
import { extractReplies, sendReplies } from '../../api/agent/reply.js'
import {
  searchBluePlanetScenario,
  startMockSseServer,
  statusOnlyScenario,
  stopMockSseServer,
} from './helpers/mock_sse_server.js'

const TEST_CFG = {
  agentPort: 0,
  agentMaxSteps: 8,
  agentMaxReplies: 3,
}

function searchPayload() {
  return {
    request_id: 'plugin-sse-test-1',
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
}

/** 模拟 apps/agent.js 里 runAgentStream 的事件处理 */
async function collectStreamLikeAgent(e, payload, cfg) {
  let sent = false
  let startedSent = false
  const startedTexts = []
  const replyTexts = []

  await chatStream(
    payload,
    async (event, data) => {
      if (event === 'started') {
        return
      }
      if (event === 'status' && data?.content) {
        startedTexts.push(data.content)
        await e.reply(data.content)
        startedSent = true
        return
      }
      if (event === 'reply') {
        const delivery = await sendReplies(e, data, cfg)
        sent = delivery.sent
        const list = extractReplies(data)
        for (const item of list) {
          const seg = item.message?.[0]
          const text = seg?.data?.text || item.content || ''
          if (text) replyTexts.push(text)
        }
      }
    },
    cfg,
  )

  return { sent, startedSent, startedTexts, replyTexts }
}

function mockEvent() {
  const out = []
  return {
    replies: out,
    reply: async (msg) => {
      out.push(msg)
    },
  }
}

describe('parseSseChunk', () => {
  it('解析 started + status + reply + done', () => {
    const raw =
      'event: started\ndata: {"request_id":"t1"}\n\n' +
      'event: status\ndata: {"content":"好嘞，找表情包~"}\n\n' +
      'event: reply\ndata: {"messages":[[{"type":"text","data":{"text":"结果"}}]]}\n\n' +
      'event: done\ndata: {}\n\n'
    const { events, rest } = parseSseChunk(raw)
    assert.equal(rest, '')
    assert.equal(events.length, 4)
    assert.equal(events[0].event, 'started')
    assert.equal(events[1].event, 'status')
    assert.equal(events[1].data.content, '好嘞，找表情包~')
    assert.equal(events[2].event, 'reply')
    assert.equal(events[2].data.messages[0][0].data.text, '结果')
    assert.equal(events[3].event, 'done')
  })
})

describe('chatStream + mock YoAgent SSE', () => {
  let mock

  before(async () => {
    mock = await startMockSseServer(searchBluePlanetScenario())
    TEST_CFG.agentPort = mock.port
  })

  after(async () => {
    await stopMockSseServer(mock.server)
  })

  it('SSE 能依次收到 started / status / reply', async () => {
    const events = []
    await chatStream(
      searchPayload(),
      async (event, data) => {
        events.push({ event, data })
      },
      { ...TEST_CFG, agentPort: mock.port },
    )

    const types = events.map((e) => e.event)
    assert.deepEqual(types, ['started', 'status', 'reply'])
    assert.match(events[1].data.content, /搜/)

    const reply = events[2].data
    assert.ok(Array.isArray(reply.messages), 'reply 应带 messages')
    const text = reply.messages[0][0].data.text
    assert.match(text, /蓝色星原/)
    assert.match(text, /蛮啾|wiki/i)
  })

  it('模拟 runAgentStream：status 与最终结果都能 e.reply，共 2 条 QQ 消息', async () => {
    const e = mockEvent()
    const cfg = { ...TEST_CFG, agentPort: mock.port }
    const result = await collectStreamLikeAgent(e, searchPayload(), cfg)

    assert.equal(result.startedSent, true)
    assert.equal(result.sent, true)
    assert.equal(result.startedTexts.length, 1)
    assert.equal(result.replyTexts.length, 1)
    assert.match(result.replyTexts[0], /蓝色星原/)
    assert.match(result.startedTexts[0], /搜/)
    assert.equal(e.replies.length, 2, '应先 status 再 reply，共 2 条')
  })
})

describe('空 reply SSE（回归：有 status 无结果）', () => {
  let mock

  before(async () => {
    mock = await startMockSseServer(statusOnlyScenario())
  })

  after(async () => {
    await stopMockSseServer(mock.server)
  })

  it('reply 为空时 sendReplies 返回 sent=false', async () => {
    const e = mockEvent()
    const cfg = { ...TEST_CFG, agentPort: mock.port }
    const result = await collectStreamLikeAgent(e, searchPayload(), cfg)

    assert.equal(result.startedSent, true)
    assert.equal(result.sent, false)
    assert.equal(result.replyTexts.length, 0)
    assert.equal(e.replies.length, 1, '只有 status，没有第二条')
  })
})
