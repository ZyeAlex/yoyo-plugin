# 终端工具约定

最后更新：2026-06-16

## 借鉴要点

AstrBot 的 `send_message_to_user`：**消息发出后 handler 应 `return None`**，Agent Loop **立即终止**。

若工具返回空文本或未正确终止，LLM 会认为任务未完成，**反复调用同一工具**（已知 bug，见 AstrBot issue #4404 / #4907）。

## YoAgent 约定（MVP 起即遵守）

1. 定义「终端工具」列表（如：向群发送最终回复）。
2. 终端工具成功执行 → Loop 必须 **DONE**，不再调 LLM。
3. 终端工具返回值写入 history 时，避免插入 `*No response*` 类占位导致 LLM 误解。

## YoAgent 落点

- `src/agent/tools/registry.py` — 标记 `terminal: true`
- `src/agent/execution/loop.py` — 检测终端工具后 break

## 验收

同一用户消息不应触发多次相同终端工具调用。
