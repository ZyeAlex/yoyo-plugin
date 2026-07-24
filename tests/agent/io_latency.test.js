/**
 * 回归：agent-io.jsonl 中「你还记得他吗 @阿P」140s 耗时分解 + SSE 投递解耦。
 *
 * 运行：node --test tests/agent/io_latency.test.js
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { chatStream } from '../../api/agent/client.js'
import { sendReplies } from '../../api/agent/reply.js'
import {
  collectStreamLegacyBlocking,
  computeSseAgentMs,
  createSseCollectHandler,
  deliverCollectedStream,
} from '../../api/agent/streamDelivery.js'
import {
  rememberApScenario,
  startMockSseServer,
  stopMockSseServer,
} from './helpers/mock_sse_server.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/remember-ap-io.json'), 'utf8'),
)

const SLOW_DELIVERY_MS = 120

function slowSendReplies(delayMs = SLOW_DELIVERY_MS) {
  return async (...args) => {
    await new Promise((r) => setTimeout(r, delayMs))
    return sendReplies(...args)
  }
}

function mockEvent() {
  const out = []
  return {
    replies: out,
    isGroup: true,
    group_id: '9701000',
    user_id: '384365260',
    self_id: '2575547802',
    reply: async (msg) => {
      out.push(msg)
    },
  }
}

describe('agent-io fixture 耗时分解', () => {
  it('观测：YoAgent ~18s，总 duration ~140s → 投递/阻塞占大头', () => {
    const { duration_ms, sse_agent_ms_observed } = FIXTURE
    const impliedDelivery = duration_ms - sse_agent_ms_observed
    assert.ok(sse_agent_ms_observed < 30_000, 'SSE started→reply 应在数十秒内')
    assert.ok(impliedDelivery > 100_000, '其余时间应在 QQ 投递或 SSE 读流阻塞')
    assert.ok(impliedDelivery > sse_agent_ms_observed * 3)
  })

  it('computeSseAgentMs 与 fixture 一致', () => {
    const ms = computeSseAgentMs([
      { event: 'started', at: 1000 },
      { event: 'reply', at: 1000 + FIXTURE.sse_agent_ms_observed },
    ])
    assert.equal(ms, FIXTURE.sse_agent_ms_observed)
  })
})

describe('SSE 投递解耦（remember-ap 场景）', () => {
  let mock

  before(async () => {
    mock = await startMockSseServer(rememberApScenario(FIXTURE.reply_data))
  })

  after(async () => {
    await stopMockSseServer(mock.server)
  })

  it('旧逻辑：reply 回调内 await sendReplies 会拖住 chatStream 读完 done', async () => {
    const e = mockEvent()
    const cfg = { agentPort: mock.port, agentMaxReplies: 3 }
    const payload = FIXTURE.payload

    const started = Date.now()
    await collectStreamLegacyBlocking(e, payload, chatStream, cfg, null, {
      sendRepliesFn: slowSendReplies(),
    })
    const elapsed = Date.now() - started
    assert.ok(elapsed >= SLOW_DELIVERY_MS - 20, `旧逻辑应等待慢投递 ${elapsed}ms`)
  })

  it('新逻辑：先读完 SSE，再投递；chatStream 不等待 QQ', async () => {
    const e = mockEvent()
    const cfg = { agentPort: mock.port, agentMaxReplies: 3 }
    const payload = FIXTURE.payload
    const collector = createSseCollectHandler()

    const streamStart = Date.now()
    await chatStream(payload, collector.handler, cfg)
    const streamMs = Date.now() - streamStart
    assert.ok(streamMs < SLOW_DELIVERY_MS / 2, `读流应快速结束，实际 ${streamMs}ms`)

    const deliveryStart = Date.now()
    const delivered = await deliverCollectedStream(e, collector.getState(), cfg, null, {
      sendRepliesFn: slowSendReplies(),
    })
    const deliveryMs = Date.now() - deliveryStart

    assert.equal(delivered.sent, true)
    assert.ok(e.replies.length >= 2, '文本 + 图两条')
    assert.ok(deliveryMs >= SLOW_DELIVERY_MS - 20)
  })
})
