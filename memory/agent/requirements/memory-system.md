# 记忆系统（OpenClaw + Hermes）

最后更新：2026-06-30

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
│   └── MEMORY.md              # 通用事实/词汇/约定（master 写）
└── group/{group_id}/
    ├── MEMORY.md              # 仅本群身份描述 / 本群成员关系（极窄）
    ├── users.yaml             # 用户画像（非 USER.md）
    └── logs/YYYY-MM-DD.md     # 观察日志（Agent 写入的「待验证观察」，**不是** QQ 群聊原始记录）
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
| 日誌 | `logs/` | Agent `memory` 工具 `target=daily` append 的观察条目 |
| MEMORY / users | `memory/data/` | 长期事实与画像 |
| 向量索引 | `data/index/knowledge.vec.db` | 记忆切片 `mem_*` scope；`memory_search` 检索 |
| SKILL | `skills/` + data/skills | 程序性记忆 |
| 游戏资料 | `data/game/*.yaml` | **不进 MEMORY**；走 `search_knowledge` 向量索引 |

## 工具

| 工具 | 用途 |
|------|------|
| `memory` | 同步读写；受 guards 约束 |
| `memory_search` / `memory_get` | 按需向量/文件检索（非每轮全量注入） |
| `load_skill` / `save_skill` | 技能渐进披露 |

## 写入路径

1. **主路径**：LLM 在对话中调用 `memory` 工具
2. **补写路径**：回复后 `memory/extract.py` 异步抽取（经 guards）
3. **禁止**：regex `detect_memory_writes`（已删除）

## 读注入 vs 向量检索

- **每轮默认**：`memory/context.py` → `format_for_inject` 注入全局+本群 MEMORY、**当前说话人**画像、今/昨日观察（约 `agentMemoryMaxInjectChars` 字）。
- **按需**：`memory_search` 在 `mem_global` / `mem_group` / `mem_user` / `mem_daily` 向量库语义检索；索引未就绪则报错。

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
