import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { hasWakeWord, messageAtBot, shouldTriggerAgent } from '../../api/agent/trigger.js'

describe('hasWakeWord', () => {
  const words = ['悠悠', '小悠']

  it('句首唤醒词触发', () => {
    assert.equal(hasWakeWord('悠悠在吗', words), true)
    assert.equal(hasWakeWord('小悠今天天气', words), true)
    assert.equal(hasWakeWord('悠悠', words), true)
  })

  it('句尾唤醒词+标点触发', () => {
    assert.equal(hasWakeWord('你好悠悠。', words), true)
    assert.equal(hasWakeWord('谢谢小悠！', words), true)
  })

  it('中间出现唤醒词不触发', () => {
    assert.equal(hasWakeWord('今天悠悠很好', words), false)
    assert.equal(hasWakeWord('你好悠悠', words), false)
    assert.equal(hasWakeWord('异环群管用不了悠悠吗', words), false)
  })
})

describe('messageAtBot / shouldTriggerAgent', () => {
  const botId = '2575547802'
  const cfg = { agentIsAt: true, agentWakeWords: ['悠悠', '小悠'] }

  it('仅 @ 机器人（无文字）应触发', () => {
    const e = {
      self_id: botId,
      message: [{ type: 'at', qq: botId, name: '悠悠Bot' }],
      raw_message: `[CQ:at,qq=${botId},name=悠悠Bot]`,
    }
    assert.equal(messageAtBot(e), true)
    assert.equal(shouldTriggerAgent(e, cfg), true)
  })

  it('兼容 data.qq 字段', () => {
    const e = {
      self_id: botId,
      message: [{ type: 'at', data: { qq: botId } }],
    }
    assert.equal(messageAtBot(e), true)
    assert.equal(shouldTriggerAgent(e, cfg), true)
  })

  it('仅 @ 他人且无唤醒词规则不触发', () => {
    const e = {
      self_id: botId,
      atBot: false,
      message: [{ type: 'at', qq: '123456' }],
    }
    assert.equal(shouldTriggerAgent(e, cfg), false)
  })

  it('@ 他人但文字以唤醒词开头仍触发', () => {
    const e = {
      self_id: botId,
      atBot: false,
      message: [
        { type: 'at', qq: '2633901703', name: '内鬼头子-阿P' },
        { type: 'text', text: ' 悠悠这个是什么人' },
      ],
    }
    assert.equal(shouldTriggerAgent(e, cfg), true)
  })

  it('@ 他人且唤醒词在中间不触发', () => {
    const e = {
      self_id: botId,
      atBot: false,
      message: [
        { type: 'at', qq: '384365260', name: '子叶' },
        { type: 'text', text: ' 异环群管用不了悠悠吗' },
      ],
    }
    assert.equal(shouldTriggerAgent(e, cfg), false)
  })

  it('@ 机器人且含唤醒词仍触发', () => {
    const e = {
      self_id: botId,
      message: [
        { type: 'at', qq: botId, name: '悠悠Bot' },
        { type: 'text', text: ' 悠悠记得我吗？' },
      ],
    }
    assert.equal(shouldTriggerAgent(e, cfg), true)
  })
})
