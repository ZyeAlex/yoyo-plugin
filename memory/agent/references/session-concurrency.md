# 会话并发锁

最后更新：2026-06-16

## 借鉴要点

AstrBot 对同一 UMO（会话）Agent 运行加 **session lock**，防止并发两次 Agent Run 竞态（历史错乱、重复回复）。

## YoAgent 场景

群聊 `group_id` 维度：同一群同时只能有一个 Agent Run 在进行。

## YoAgent 落点

- 实现位置：`src/agent/execution/` 或 service 层（Run 开始前 acquire）
- 键：`group_id`（或 `group_id + run_id`）
- 行为：锁占用时，新请求排队或返回 409 / 等待（待产品定）

## MVP

至少 **asyncio.Lock  per group_id** 内存锁；多实例部署后续换 Redis 分布式锁。
