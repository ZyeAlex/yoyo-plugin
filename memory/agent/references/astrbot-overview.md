# AstrBot 总览

最后更新：2026-06-16

## 定位

全栈 IM Agent 平台：多平台接入 + Pipeline + ToolLoop Agent + 插件 + WebUI。约 3.5 万 star。

## 与 Harness Engineering 的关系

- **有 Harness 实质**：Context、Tool Loop、Tools、Memory 压缩、Skills、Guardrails、Observability 均已落地。
- **无 Harness 命名/分层**：以 `pipeline/` + `agent/runners/` 组织，不是显式 `harness/` 或 LangGraph。
- **第一性原理不同**：AstrBot = IM 平台优先；YoAgent = Agent 控制平面优先（API 服务）。

## YoAgent 借鉴策略

| 学 | 不学 |
|----|------|
| Tool Loop 语义、工具契约、上下文压缩、Skills 披露 | 9 段 IM Pipeline 全搬 |
| 终端工具、会话锁、max_step 收尾 | 多 IM 适配、WebUI、插件生态 |
| Transport / Agent 边界 | 整个 `astrbot/core/` 目录结构 |

## 对照：AstrBot 模块 → YoAgent 落点

| AstrBot 概念 | YoAgent 目录 |
|--------------|--------------|
| ToolLoopAgentRunner | `src/agent/execution/loop.py` |
| Pipeline ShouldRespond | `src/agent/planning/` 或 LangGraph 节点 |
| ContextManager | `src/agent/memory/working.py` |
| SkillManager | `src/agent/skills/loader.py` |
| ToolSet | `src/agent/tools/registry.py` |
| conversation_mgr | `src/agent/memory/store.py` + DB |
| Provider 层 | 后续 `src/agent/` 内 LLM 封装（或 `core` 薄封装） |
