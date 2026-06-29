/**
 * 回复投递：e.reply 失败时 Bot.sendMsg 兜底
 *
 * 运行：node --test tests/agent/reply_delivery.test.js
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import './register_globals.js'
import { captureReplyTarget, sendReply } from '../../api/agent/reply.js'

const ORIG_BOT = global.Bot

function mockEvent({ replyFails = false } = {}) {
  return {
    isGroup: true,
    group_id: '9701000',
    user_id: '111',
    self_id: '222',
    reply: async () => {
      if (replyFails) throw new Error('reply context expired')
    },
  }
}

function mockBot({ sendFails = false } = {}) {
  const sent = []
  global.Bot = {
    222: {
      pickGroup: (gid) => ({
        sendMsg: async (msg) => {
          if (sendFails) throw new Error('send failed')
          sent.push({ gid, msg })
        },
      }),
    },
  }
  return sent
}

describe('sendReply delivery fallback', () => {
  beforeEach(() => {
    global.segment = {
      image: (url) => ({ type: 'image', url }),
      at: (qq) => ({ type: 'at', qq }),
      reply: (id) => ({ type: 'reply', id }),
      face: (id) => ({ type: 'face', id }),
    }
  })

  afterEach(() => {
    global.Bot = ORIG_BOT
  })

  it('e.reply 成功时 via=e.reply', async () => {
    mockBot()
    const e = mockEvent()
    const result = await sendReply(e, {
      message: [{ type: 'text', data: { text: '记下了~' } }],
    })
    assert.equal(result.sent, true)
    assert.equal(result.via, 'e.reply')
  })

  it('e.reply 失败时走 Bot.sendMsg', async () => {
    const sent = mockBot()
    const e = mockEvent({ replyFails: true })
    const target = captureReplyTarget(e)
    const result = await sendReply(
      e,
      { message: [{ type: 'text', data: { text: '记下了~' } }] },
      target,
    )
    assert.equal(result.sent, true)
    assert.equal(result.via, 'bot.sendMsg')
    assert.equal(sent.length, 1)
    assert.equal(sent[0].gid, '9701000')
  })

  it('e.reply 与 Bot 均失败时 sent=false', async () => {
    mockBot({ sendFails: true })
    const e = mockEvent({ replyFails: true })
    const result = await sendReply(
      e,
      { message: [{ type: 'text', data: { text: 'x' } }] },
      captureReplyTarget(e),
    )
    assert.equal(result.sent, false)
    assert.equal(result.via, undefined)
  })
})
