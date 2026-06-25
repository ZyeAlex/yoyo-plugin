# 记忆系统（OpenClaw + Hermes）

最后更新：2026-06-24

## 目录分工（均在 `src/agent/` 下）

| 路径 | 性质 | 说明 |
|------|------|------|
| `memory/*.py` | **代码** | store、paths、context、guards、extract、emotion、session |
| `memory/data/` | **运行时数据** | MEMORY.md、users.yaml、logs（gitignore） |
| `prompts/system/core.md` + `prompts/playbooks/` | 静态 | 薄 system + 按需 playbook |
| `skills/` | 静态 + 可写 | 内置 `*/SKILL.md` + group/global 目录 |

## 运行时数据结构

```
src/agent/memory/data/
├── global/
│   └── MEMORY.md              # 跨群事实（master 写）
└── group/{group_id}/
    ├── MEMORY.md              # 本群约定/黑话
    ├── users.yaml             # 用户画像（非 USER.md）
    └── logs/YYYY-MM-DD.md     # 日誌观察
```

### users.yaml 字段

| 字段 | 说明 |
|------|------|
| `display_name` | 群名片 |
| `nickname` | 希望 Bot 称呼 |
| `preferences` | 偏好列表 |
| `notes` | 备注 |
| `from_others` | 他人对某用户的评价（about） |

**不含** `emotion` 历史。瞬时情绪见 [`memory-token-policy.md`](memory-token-policy.md)。

## 记忆分层

| 层 | 存储 | 说明 |
|----|------|------|
| 插件缓冲 | 进程内 | `agentBufferSize` |
| Session | YoAgent 进程内 | `agentSessionHistoryTurns` |
| 日誌 | `logs/` | append 观察 |
| MEMORY / users | `memory/data/` | 长期事实与画像 |
| SKILL | `skills/` + data/skills | 程序性记忆 |
| 游戏资料 | `data/game/*.yaml` | **不进 MEMORY** |

## 工具

| 工具 | 用途 |
|------|------|
| `memory` | 同步读写；受 guards 约束 |
| `memory_search` / `memory_get` | 按需检索 |
| `load_skill` / `save_skill` | 技能渐进披露 |

## 写入路径

1. **主路径**：LLM 在对话中调用 `memory` 工具
2. **补写路径**：回复后 `memory/extract.py` 异步抽取（经 guards）
3. **禁止**：regex `detect_memory_writes`（已删除）

## 配置

见 `config/default.yaml`：`agentMemoryCharLimit`、`agentUserMemoryCharLimit`、`agentMemoryMaxInjectChars`、`agentDailyLogInjectChars` 等。

## 代码落点

| 模块 | 路径 |
|------|------|
| 存储 | `memory/store.py` |
| 路径 | `memory/paths.py` |
| 读注入 | `memory/context.py` |
| 守卫 | `memory/guards.py` |
| 异步抽取 | `memory/extract.py` |
| 本轮情绪 | `memory/emotion.py` |
