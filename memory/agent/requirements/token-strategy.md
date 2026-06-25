# Token 节省总策略

最后更新：2026-06-24

## 目标

群聊场景消息量大，**不能**用户每说一句就跑全量 Agent。在插件已做触发过滤的前提下，YoAgent 内部仍须把**单次 respond 的 input/output token 压到最低**。

## 三层省钱

| 层 | 手段 | 预期效果 |
|----|------|----------|
| **L0 不调用** | 入库、健康检查、配置更新 | 0 token |
| **L1 少调用** | 纯 ReAct；闲聊时模型自选 0 工具 | 相对全量 tool schema 省 token |
| **L2 少塞上下文** | core + 条件 playbook + 记忆读块 + 渐进工具 schema | 单次 input 可控 |

## 硬预算（默认值，可 env 配置）

| 项 | 默认 | 说明 |
|----|------|------|
| `MAX_INPUT_TOKENS` | 6000 | 单次 respond 组装后上限；超限走压缩链 |
| `MAX_OUTPUT_TOKENS` | 512 | 群聊宜短回复 |
| `MAX_AGENT_STEPS` | 4 | ReAct 最多 4 轮（含首轮 LLM） |
| `WORKING_MESSAGE_COUNT` | 8 | 工作窗口条数（仅 user/assistant，不含全群刷屏） |
| `MEM0_SEARCH_TOP_K` | 3 |  episodic 记忆条数 |
| `TOOL_RESULT_MAX_CHARS` | 1500 | 工具结果写入 context 上限 |

## 禁止进 Prompt 的内容

- 全群完整历史
- 所有群成员 Mem0 全量
- 未激活 Skill 的全文
- 未选工具的 full schema 列表（用轻量 catalog）
- 原始 plugin metadata JSON（只保留必要字段）

## 异步 / 离线（不占回复路径 token）

- Mem0 **写入**（ExtractMemory）
- 群滚动摘要更新（每 N 条或定时，非每 respond）
- Eval trace 归档

## 模型分级（后续）

| 任务 | 模型档 |
|------|--------|
| ExtractMemory 异步抽取 | 小/便宜 |
| 最终群聊回复 | 主模型 |
| 上下文 LLM 摘要 | 小/便宜；且**非每轮必跑** |

## 子文档

- [context-assembly.md](context-assembly.md) — 拼什么进 messages
- [memory-token-policy.md](memory-token-policy.md) — 记忆读写
- [react-short-path.md](react-short-path.md) — ReAct 最短链
- [../references/context-compression.md](../references/context-compression.md) — AstrBot 压缩阶梯
