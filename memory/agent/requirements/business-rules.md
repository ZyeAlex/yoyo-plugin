# 业务硬约束

最后更新：2026-06-26

## 架构

1. **插件触发才跑 LLM**：缓冲入库 0 token；YoAgent 在 `@`/唤醒词后 respond。
2. **Agent 逻辑不进路由层**：endpoints → services → `src/agent/`。
3. **LLM 与 Loop 分离**：`llm/provider.py` 独立于 `execution/loop.py`。
4. **同群串行**：`execution/session_run.py`（claim + followup 队列）。

## Token

5. **纯 ReAct，无关键词 IntentRoute**：见 [react-short-path.md](react-short-path.md)。
6. **硬预算**：`agentMaxSteps`（默认 4）、`agentToolResultMaxChars`、`agentMemoryMaxInjectChars`。
7. **上下文窄注入**：core + 条件 playbook + 记忆读块；见 [context-assembly.md](context-assembly.md)。
8. **记忆异步补写**：`extract.py` 不在回复 critical path。
9. **禁止全量群历史进 prompt**（插件缓冲仅最近 N 条 + session 多轮）。

## 记忆

10. **游戏 lore 不进 MEMORY**：guards 拒绝；用 `get_lore` / `query_game_data`。
11. **情绪不落盘**：`analyze_emotion` 仅本轮语气；users.yaml 不写 emotion 日志。
12. **画像写稳定事实**：称呼、偏好、群规、他人评价；性格可归纳到 preference/note。

## Agent 行为

13. **终端工具即结束 Loop**（规划；见 terminal-tool-contract）。
14. **memory 工具落盘前过 guards**。
15. **禁止用户消息关键词/正则硬编码**：不得用 `re.search`、关键词表等匹配用户原文来分支 prompt 注入、工具选择或上下文逻辑；仅允许 OneBot 结构信号（@、reply 链、user_id、mid）与配置项（权限、开关）。语义由 LLM 在已组装的上下文中完成。

## 游戏资料

16. **数值/面板以本地 YAML 为准**；未收录须明说。
17. **Mem0/SQLite 不替代当前 YAML 工具路径**（FTS 为规划增强）。

详见 [game-knowledge.md](game-knowledge.md)。
