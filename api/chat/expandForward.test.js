import assert from 'node:assert/strict'
import test from 'node:test'
import { extractForwardId, formatForwardMessages, expandForwardInPlace } from './expandForward.js'

test('extractForwardId from CQ and segment', () => {
  assert.equal(
    extractForwardId({ raw_message: '[CQ:forward,id=abc/def+1]' }),
    'abc/def+1',
  )
  assert.equal(
    extractForwardId({ message: [{ type: 'forward', id: 'resid123' }], raw_message: '' }),
    'resid123',
  )
  assert.equal(extractForwardId({ message: [{ type: 'text', text: 'hi' }] }), '')
})

test('formatForwardMessages flattens nodes', () => {
  const text = formatForwardMessages([
    {
      sender: { nickname: '塔菲' },
      message: [{ type: 'text', data: { text: '你好' } }],
    },
    {
      nickname: '夜夜',
      message: [
        { type: 'at', data: { qq: '1', name: '悠悠' } },
        { type: 'text', data: { text: ' 看这个' } },
      ],
    },
  ])
  assert.match(text, /\[转发的聊天记录\]/)
  assert.match(text, /塔菲: 你好/)
  assert.match(text, /夜夜: @悠悠 看这个/)
})

test('expandForwardInPlace rewrites message via getForwardMsg', async () => {
  const e = {
    message: [{ type: 'forward', id: 'x1' }],
    raw_message: '[CQ:forward,id=x1]',
    bot: {
      async getForwardMsg(id) {
        assert.equal(id, 'x1')
        return [{ sender: { nickname: '甲' }, message: [{ type: 'text', text: '哈' }] }]
      },
    },
  }
  assert.equal(await expandForwardInPlace(e), true)
  assert.equal(e.message.length, 1)
  assert.equal(e.message[0].type, 'text')
  assert.match(e.message[0].text, /甲: 哈/)
  assert.match(e.raw_message, /甲: 哈/)
})
