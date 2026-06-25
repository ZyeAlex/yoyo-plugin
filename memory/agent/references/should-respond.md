# 何时回复（ShouldRespond）

最后更新：2026-06-16

## 借鉴要点

AstrBot 在 Agent 运行前用 Pipeline Stage 过滤：唤醒检查、白名单、会话 AI 开关、限流、内容安全。只有 @提及 / 唤醒词才进入 Agent。

群聊 Bot **默认不应每条消息都回**，否则刷屏。

## YoAgent 默认策略

- `@Agent` 或消息含 bot 名称 → 可回复
- API 参数 `force_respond=true` → 强制回复
- 否则 → 仅入库，不触发 Agent Loop

## YoAgent 落点

- **触发过滤在 yoyo-plugin**：白名单群、`@`、唤醒词（`agentWakeWords`）— 见 [`../../07-agent-integration.md`](../../07-agent-integration.md)
- YoAgent **不**实现 ShouldRespond；收到 `/api/chat` 即跑 Agent
- ~~`planning/planner.py`~~（已删除 IntentRoute；勿再规划 server 侧关键词触发）

## 不照搬

AstrBot 的 Whitelist / ContentSafety 等 Stage 名称与实现；YoAgent 按 Yunzai 场景简化。
