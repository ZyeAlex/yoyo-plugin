# References 索引

最后更新：2026-06-16

外部项目研读结论，供 YoAgent 设计决策引用。**只记本项目要借鉴什么、落在哪里**；不复制对方仓库路径与实现细节。

## AstrBot

来源：[AstrBotDevs/AstrBot](https://github.com/AstrBotDevs/AstrBot)（2026-06 研读）

| 文件 | 内容 |
|------|------|
| [astrbot-overview.md](astrbot-overview.md) | 定位、是否有 Harness 思想 |
| [transport-agent-split.md](transport-agent-split.md) | 传输层与 Agent 分离 |
| [should-respond.md](should-respond.md) | 何时回复（Pipeline 前滤） |
| [tool-loop-semantics.md](tool-loop-semantics.md) | Tool Loop 核心语义 |
| [terminal-tool-contract.md](terminal-tool-contract.md) | 终端工具约定 |
| [context-compression.md](context-compression.md) | 分层上下文压缩 |
| [skills-progressive-disclosure.md](skills-progressive-disclosure.md) | Skills 渐进披露 |
| [session-concurrency.md](session-concurrency.md) | 会话并发锁 |
| [runner-provider-split.md](runner-provider-split.md) | Runner 与 LLM Provider 分离 |
| [follow-up-injection.md](follow-up-injection.md) | 运行中追加用户消息 |
| [harness-vs-loop.md](harness-vs-loop.md) | Harness 与 Loop Engineering |
| [not-to-copy.md](not-to-copy.md) | 不照搬清单 |

## 与 playbook 的边界

- **references/**：本项目设计决策与外部对照
- **playbook/**：跨项目可复用工具参数与踩坑（项目结束后提炼）
