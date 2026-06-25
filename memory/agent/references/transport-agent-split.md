# 传输层与 Agent 分离

最后更新：2026-06-16

## 借鉴要点

AstrBot 把 **IM 管道**（唤醒、白名单、限流、发消息）与 **Agent 循环**（ToolLoopAgentRunner）严格分开。Agent 不直接操作 QQ/TG API；由 `run_agent()` 桥接。

## YoAgent 落点

| 层 | 路径 | 职责 |
|----|------|------|
| 传输 | `src/api/` | HTTP、API Key、SSE；对接 Yunzai 插件 |
| Agent | `src/agent/` | 规划、执行、工具、记忆；**不含 HTTP** |

## 硬约束

- `api/endpoints` 只调 service，不写 Tool Loop。
- Agent 输出纯文本/结构化结果；由 API 层决定同步 JSON 还是 SSE。

## 不照搬

AstrBot 的 9 段 Pipeline；YoAgent 只需 API 鉴权 +（后续）ShouldRespond 节点。
