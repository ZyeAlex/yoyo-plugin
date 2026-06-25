# 分层上下文压缩

最后更新：2026-06-16

## 借鉴要点

AstrBot `ContextManager` 按成本从低到高：

1. **按轮数截断** — 去掉过早的消息
2. **按 token 检查** — 超限再处理
3. **LLM 摘要** — 压缩早期对话为摘要
4. **减半截断** — 摘要仍超限时的 fallback

先便宜后昂贵，避免一上来就调 LLM 做摘要。

## YoAgent 记忆分层（与压缩配合）

| 层 | 来源 | 进入 context 顺序 |
|----|------|-------------------|
| Persona | DB Persona 表 | system prompt |
| Episodic | Mem0 top-k | system 或单独段 |
| Working | DB 最近 N 条 | messages |
| 压缩 | working 超限后 | 摘要替换早期 working |

## YoAgent 落点

- `src/agent/memory/working.py` — 截断 + token 估算
- `src/agent/memory/store.py` — Mem0 检索（在压缩前注入高价值记忆）

## 参数（待实现时确认）

- `RECENT_MESSAGES_LIMIT`：默认 20
- 摘要触发 token 阈值：待压测
