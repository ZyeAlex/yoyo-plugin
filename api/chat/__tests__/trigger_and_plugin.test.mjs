import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hasWakeWord, isActiveInitiate, buildHints } from '../trigger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// wake: 真喊悠悠
assert.equal(hasWakeWord('悠悠在吗', ['悠悠', '小悠']), true)
assert.equal(hasWakeWord('小悠你好', ['悠悠', '小悠']), true)
assert.equal(hasWakeWord('喂 悠悠', ['悠悠']), true)

// wake: 角色指令里的「悠悠」不能算唤醒
assert.equal(hasWakeWord('寒悠悠图片15', ['悠悠', '小悠']), false)
assert.equal(hasWakeWord('~寒悠悠图片16', ['悠悠']), false)
assert.equal(hasWakeWord('寒悠悠技能', ['悠悠']), false)
assert.equal(hasWakeWord('@2575547802 寒悠悠图片', ['悠悠']), false)

// hints
const hintsCmd = buildHints(
  { msg: '寒悠悠图片15', raw_message: '寒悠悠图片15', message: [], atme: false, atBot: false },
  { chatWakeWords: ['悠悠'] },
)
assert.equal(hintsCmd.wake_word, false)
assert.equal(isActiveInitiate(hintsCmd), false)

const hintsWake = buildHints(
  { msg: '悠悠看看', raw_message: '悠悠看看', message: [], atme: false, atBot: false },
  { chatWakeWords: ['悠悠'] },
)
assert.equal(hintsWake.wake_word, true)

// plugin source: 禁止 Bot.on，必须走 rule
const pluginSrc = fs.readFileSync(path.join(__dirname, '../plugin.js'), 'utf8')
assert.equal(pluginSrc.includes("Bot.on('message'"), false)
assert.equal(pluginSrc.includes('Bot.on("message"'), false)
assert.equal(/priority:\s*50000/.test(pluginSrc), true)
assert.equal(/reg:\s*\/\[\\s\\S\]\*\//.test(pluginSrc) || pluginSrc.includes('reg: /[\\s\\S]*/'), true)
assert.equal(pluginSrc.includes('onGroupMessage'), true)

// apps/chat.js 已同步
const appsSrc = fs.readFileSync(path.join(__dirname, '../../../apps/chat.js'), 'utf8')
assert.equal(appsSrc.includes("Bot.on('message'"), false)
assert.equal(appsSrc.includes('priority: 50000'), true)

// 模拟 Yunzai loader：先匹配图片指令则不会落到 Chat
function simulateLoader(msg, plugins) {
  const ordered = [...plugins].sort((a, b) => a.priority - b.priority)
  for (const p of ordered) {
    for (const rule of p.rule || []) {
      if (!rule.reg.test(msg)) continue
      const res = rule.fnc(msg)
      if (res === false) continue
      return p.name
    }
  }
  return null
}

const imgReg = /^(?!#?(?:查看)?原图$)#?(?!上传|添加|随机(?!角色)?)(.{0,5})(?:图片?|照片|美图|美照)([0-9]{1,4})$/
const handled = []
const winner = simulateLoader('寒悠悠图片15', [
  {
    name: 'Img',
    priority: 100,
    rule: [{ reg: imgReg, fnc: () => { handled.push('img'); return undefined } }],
  },
  {
    name: 'Chat',
    priority: 50000,
    rule: [{ reg: /[\s\S]*/, fnc: () => { handled.push('chat'); return undefined } }],
  },
])
assert.equal(winner, 'Img')
assert.deepEqual(handled, ['img'])

const winner2 = simulateLoader('今天吃什么', [
  {
    name: 'Img',
    priority: 100,
    rule: [{ reg: imgReg, fnc: () => { handled.push('img2'); return undefined } }],
  },
  {
    name: 'Chat',
    priority: 50000,
    rule: [{ reg: /[\s\S]*/, fnc: () => { handled.push('chat2'); return undefined } }],
  },
])
assert.equal(winner2, 'Chat')
assert.ok(handled.includes('chat2'))

console.log('ok trigger_and_plugin')
