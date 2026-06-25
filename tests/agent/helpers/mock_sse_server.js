import http from 'node:http'

/**
 * 最小 YoAgent SSE mock：按序推送 event/data，最后 done。
 * @param {{ events: Array<{ event: string, data: object, delayMs?: number }> }} scenario
 */
export function createMockSseServer(scenario) {
  const server = http.createServer((req, res) => {
    const url = req.url || ''
    if (req.method !== 'POST' || !url.startsWith('/api/chat')) {
      res.writeHead(404)
      res.end()
      return
    }

    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', async () => {
      const isStream = url.includes('stream=1')

      if (!isStream) {
        const replyEvt = scenario.events.find((e) => e.event === 'reply')
        const data = replyEvt?.data || { reply: { content: '' } }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ code: 0, message: 'ok', data }))
        return
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })

      for (const evt of scenario.events) {
        if (evt.delayMs) {
          await new Promise((resolve) => setTimeout(resolve, evt.delayMs))
        }
        if (evt.event === 'done') continue
        res.write(`event: ${evt.event}\n`)
        res.write(`data: ${JSON.stringify(evt.data)}\n\n`)
      }
      res.write('event: done\ndata: {}\n\n')
      res.end()
    })
  })

  return server
}

export function startMockSseServer(scenario) {
  const server = createMockSseServer(scenario)
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ server, port, baseURL: `http://127.0.0.1:${port}` })
    })
    server.on('error', reject)
  })
}

export function stopMockSseServer(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
}

/** 模拟「搜一下蓝色星原」：started（握手）→ status → reply → done */
export function searchBluePlanetScenario() {
  const resultText =
    '搜到啦~《蓝色星原：旅谣》是蛮啾网络出品的星宠结伴幻想大世界RPG，wiki.biligame.com/ap 有百科~'
  const bubble = [{ type: 'text', data: { text: resultText } }]
  const replyData = {
    reply: { message: bubble },
    replies: [{ message: bubble }],
    messages: [bubble],
  }
  return {
    events: [
      {
        event: 'started',
        data: { request_id: 'mock-1' },
      },
      {
        event: 'status',
        data: { content: '好嘞，上网搜一下~' },
      },
      { event: 'reply', data: replyData, delayMs: 50 },
    ],
  }
}

/** 模拟 bug：有 status 但 reply 为空 */
export function statusOnlyScenario() {
  return {
    events: [
      {
        event: 'started',
        data: { request_id: 'mock-2' },
      },
      {
        event: 'status',
        data: { content: '好嘞，上网搜一下~' },
      },
      {
        event: 'reply',
        data: { reply: { content: '' }, replies: [{ content: '' }] },
        delayMs: 30,
      },
    ],
  }
}
