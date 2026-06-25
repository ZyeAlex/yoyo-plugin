# 运行中 Follow-up 注入

最后更新：2026-06-16

## 借鉴要点

AstrBot 支持 Agent **工具执行期间**用户再发消息：消息入队，在下一轮 tool result 后 **inject 进 messages**，避免丢失上下文。

群聊里用户连发、或 Agent 执行较慢时常见。

## YoAgent 落点

- 队列键：`group_id`
- 注入点：`execution/loop.py` 每 step 开始前 drain 队列
- API：`POST /messages` 若该群有 RUNNING 的 AgentRun → 入队而非新开 Run

## MVP 优先级

**P1 之后**；MVP 可先「单 Run 串行 + 会话锁」，follow-up 队列后加。

## 参考

AstrBot PR #5484 模式（名称以实际代码为准）。
