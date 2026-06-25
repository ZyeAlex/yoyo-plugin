# 记忆管理与 Token

最后更新：2026-06-24

## 读写分离

| 操作 | 时机 | 模型 | 占回复 token |
|------|------|------|--------------|
| **读** 记忆片段 | respond 前 | 无 LLM | `build_memory_context` 注入（上限 `agentMemoryMaxInjectChars`） |
| **写** memory 工具 | respond 中 | 主模型 tool call | 工具结果截断 |
| **写** ExtractMemory | respond **后** 异步 | 主/小模型 JSON | **0**（不阻塞 SSE/JSON） |
| **写** 情绪 | — | **不落盘** | 0 |

## 同步写：memory 工具 + guards

`tools/memory.py` 在 add/replace 前调用 `memory/guards.validate_memory_write`：

- **拒绝** 游戏 lore/图鉴事实 → 应用 `get_lore` / `query_game_data`
- **拒绝** Agent 元信息（工具名、`SKILL.md` 等）
- **global_memory** 需 master
- **user** 需有效 user_id

## 异步写：extract.py

`yoyo_chat_service._finalize_success` → `schedule_extract_memory`：

- 输入：用户句 + assistant 最终文本
- LLM 输出 `{ writes: [{ target, content, user_field?, ... }] }`
- 每条经 guards 后 `store.add`

**不写**：瞬时情绪、游戏设定、工具流程说明。

## 读策略

- 群 MEMORY / global MEMORY / users.yaml / 日誌 → `store.load_snapshot` + 截断注入
- `memory_search` / `memory_get` 供 LLM 按需检索（非全量塞 prompt）

## 用户画像边界

| 写入 | 不写入 |
|------|--------|
| 称呼、偏好、群规、他人评价 | 情绪日志、角色 lore、图鉴数值 |
| `preference` / `note` 可归纳长期性格 | 逐条「烦躁/低落」时间线 |

## 代码落点

| 职责 | 路径 |
|------|------|
| 读注入 | `memory/context.py`、`memory/store.py` |
| 守卫 | `memory/guards.py` |
| 异步写 | `memory/extract.py` |
| 同步写 | `tools/memory.py` |
| 本轮情绪 | `memory/emotion.py`（仅 analyze + inject） |
