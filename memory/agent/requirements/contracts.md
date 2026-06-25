# API 契约（yoyo-plugin）

最后更新：2026-06-17

**Base URL**：`http://127.0.0.1:{agentPort}`（默认 `8787`，由 `api/agent/schema.js` 拼接）  
**认证**：YoAgent 支持 `Authorization: Bearer <API_KEY>`（`server/.env` 的 `API_KEY`；为空时不校验）。**当前插件 `client.js` 未发送 Bearer**，同源本机调用。

## POST /api/chat

yoyo-plugin 在群内 **@机器人** 后，携带内存缓冲区的全部消息发起请求。

### 请求体（摘要）

```json
{
  "request_id": "uuid",
  "session": {
    "session_id": "group:{群号}:bot:{机器人QQ}",
    "group_id": "991709221",
    "bot_id": "123456789"
  },
  "messages": [
    {
      "message_id": "1001",
      "user_id": "111",
      "sender": { "nickname": "小明", "card": "小明" },
      "message": [{ "type": "text", "text": "今天更新了什么" }],
      "raw_message": "今天更新了什么",
      "time": 1710000000
    }
  ]
}
```

- `messages`：OneBot v11 消息段原样透传，时间升序
- 触发：消息段含 `{ "type": "at", "qq": "<bot_id>" }`
- 无 @ 触发时 YoAgent 返回空 `reply`（插件不发消息）

### 成功响应

HTTP `200` 且 **`code === 0`**：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "reply": { "content": "回复正文" }
  }
}
```

### 失败 / 空回复

```json
{ "code": 1, "message": "错误说明" }
```

插件侧（`apps/agent.js`）：

| 情况 | QQ 行为 |
|------|---------|
| 有效 `reply` | 正常回复 |
| `code: 0` 但空 `reply` | 「唔…一时想不起来，稍后再问我吧」 |
| `code !== 0` / 超时 / 网络错误 | 「刚才查资料出了点问题，稍后再试~」 |

详见 [`../../07-agent-integration.md`](../../07-agent-integration.md) §2.3。

## GET /api/health

无需认证。`{"status": "ok"}`

## YoAgent 实现落点

| 模块 | 路径 |
|------|------|
| HTTP 入口 | `src/api/endpoints/yoyo_chat.py` |
| 业务 | `src/services/yoyo_chat_service.py` |
| Agent | `src/agent/runner.py` + `execution/loop.py` |
| Schema | `src/schemas/yoyo.py` |
| 鉴权 | `src/api/deps.py` → `verify_bearer_token` |

## yoyo-plugin 配置对照

```yaml
agentEnabled: true
agentPort: 8787
agentInclude: [群号]
agentIsAt: true
agentTimeout: 60
agentLlmApiKey: sk-xxx
```

插件侧完整对接文档：[`../../07-agent-integration.md`](../../07-agent-integration.md)。
