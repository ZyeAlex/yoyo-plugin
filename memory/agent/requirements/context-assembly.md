# 上下文组装（Context Assembly）

最后更新：2026-06-26

## 原则

**按需注入、固定顺序、先稳后变。** 由 `ContextAssembler` 在进 loop 前完成；Loop 只消费 `messages[]`。

**Playbook 与注入块由结构信号驱动**（权限、是否有图、legacy 开关），**不用**用户消息关键词匹配。

**禁止在代码里用正则/关键词规则匹配用户消息**来决定 prompt 注入、工具路由或上下文分支（例如「搞错了」「记住了」等句式检测）。语义理解交给 LLM + 结构化上下文（reply 链、@、session 历史、按需选取的群消息）；代码只做 OneBot 结构信号与相关度打分。

## 组装入口

| 职责 | 路径 |
|------|------|
| 组装 | `src/agent/context/assembler.py` → `ContextAssembler.build()` |
| 结构信号 | `AssembleContext`：`has_images`、`is_master`、`emoticon_enabled`、`vision_enabled`、`legacy_full_prompt` |
| 记忆读块 | `src/agent/memory/context.py` → `build_memory_context()` |

## System 块顺序（当前）

| 顺序 | 块 | 来源 |
|------|-----|------|
| 1 | core + scene_hint + JSON 回复格式 | `prompts/system/core.md` + 场景行 |
| 2 | 条件 playbook | `prompts/playbooks/*.md` |
| 3 | 长期记忆 + 用户画像 + 技能目录 | `build_memory_context` |
| 4 | 权限 | `auth/permissions.format_permission_inject` |
| 5 | 词条定位（可选） | `term_resolver.format_term_inject(term_source)` |
| 6 | master 工作区/脚本/技能 runtime | `is_master` 时 |
| 7 | 可分析图片列表 | `has_images` 时 |
| 8 | 表情包 taxonomy | `emoticon_enabled` 时 |
| 9 | 工具目录 | `tools/catalog.format_tool_catalog` |
| 10 | 技能列表 + lore 索引 | 始终（短目录） |

## Playbook 激活（非 legacy）

| Playbook | 条件 |
|----------|------|
| `permissions` | 始终 |
| `memory` | 始终 |
| `game-query` | 始终 |
| `vision` | `has_images && vision_enabled` |
| `emoticon` | `emoticon_enabled` |
| `filesystem` / `script` / `skills-usage` / `skills-author` | `is_master` |

`agentLegacyFullPrompt: true` → 加载全部 playbook（兼容开关）。

## 本轮情绪（不落盘）

- `analyze_emotion(trigger_text)` → `ChatContext.emotion`
- 仅当 notable 时注入 `[用户情绪]`（`memory/emotion.format_emotion_inject`）
- **不**读取 users.yaml 历史情绪；**不**提示写入 memory

## User 消息

- 插件侧 `[群聊上下文]` + `[当前请求]`（见 `07-agent-integration.md`）
- Session 多轮：`memory/session.py` history append

## 未实现 / 规划中

- DB Persona 精简版、群滚动摘要、Mem0 云检索
- `estimate_tokens()` 超预算压缩阶梯（文档保留方向，代码待接）

## inject_meta（trace）

`playbooks`、`system_chars`、`has_images`、`is_master` → `yoyo_chat_service._trace_run` / ioLog。
