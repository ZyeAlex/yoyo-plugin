# 数据存储

最后更新：2026-06-24

> **当前 MVP**：YoAgent 直接读插件仓 `data/game/*.yaml`（含 `lore/*.yaml`），见 [../requirements/game-knowledge.md](../requirements/game-knowledge.md)。下文 SQLite 表为 **规划**，尚未建库。

## Agent 运行时数据（`server/src/agent/memory/`，gitignore 除 .gitkeep）

| 路径 | 说明 |
|------|------|
| `memory/data/group/{群号}/` | 本群 MEMORY.md、users.yaml、daily logs |
| `memory/data/global/` | 全局 MEMORY |
| `memory/emoticon/` | 表情包 catalog：`index.yaml` + `files/*.gif`；全局共享；Sidecar 写入 |
| `memory/script/` | 主人脚本：`once/`、`tasks/`、`logs/`、`registry.yaml` |
| `memory/skills/` | 用户可写技能（群/全局） |

表情包索引字段（v2）：`mood`（固定词表）、`keywords`（视觉模型自由打标）、`summary`、`seen_count`、`use_count`、`last_seen`、`last_used`。

插件侧调试日志：`data/logs/agent-io.jsonl`（请求/响应 JSONL，gitignore）。

## 业务库（消息 / 群 / 用户）

开发默认 SQLite：`DATABASE_URL=sqlite:///./data/yoagent.db`  
生产可用 PostgreSQL，表结构一致。

| 表 | 说明 |
|----|------|
| groups | group_id, platform, metadata |
| users | user_id, display_name, traits |
| group_members | group_id + user_id |
| messages | 群消息审计 |
| personas | 群内 Agent 角色（口癖、system 片段） |
| agent_runs | 每次 Harness 执行记录 |

## 游戏资料库（本地知识，默认无 embedding）

与业务库 **同 SQLite 文件** 或独立 `sqlite:///./data/game.db`（2C4G 推荐单文件，减少连接开销）。

| 表 | 说明 |
|----|------|
| `game_meta` | `data_version`, `updated_at` |
| `entities` | 统一实体：type(character/kibo/item/…), name, slug, summary |
| `entity_aliases` | 别名 → entity_id（群聊昵称、简称） |
| `characters` | 结构化面板 JSON（攻击、属性、技能 ID 等） |
| `character_profiles` | 角色长文本（人设、剧情），按 character_id |
| `kibo` / `items` | 奇波、道具结构化数据 |
| `lore_sections` | 世界观分类文本 |
| `guide_chunks` | 攻略切片（title, tags, body, source） |
| `guide_fts` | **FTS5** 虚拟表，索引 `guide_chunks` |
| `game_notices` | 活动/公告摘要（可选 CMS 同步） |

**可选（L2，非默认）**：`chunk_embeddings` — 离线批处理写入，查询时本地 cosine，不在热路径算 embedding。

### 原始文件目录（导入源）

```
data/game/
├── lore/           # 背景文本，按分类子目录
├── characters/     # 角色 JSON + profile 文本
├── guides/         # 攻略 markdown/txt
└── aliases.json    # 别名表（可选）
```

大文件不提交 git；仓库保留 `data/game/.gitkeep` + 样例。

## Mem0（仅用户/群聊记忆）

- `run_id` = `group_id`
- 用户消息 `name` = `user_name`；Agent `name` = persona name
- **不存**游戏 wiki 正文；wiki 走本地 FTS/SQL

环境变量：`MEM0_API_KEY`（可选；推荐云 API，2C4G 本机不跑向量模型）

## 相关文档

- [../requirements/game-knowledge.md](../requirements/game-knowledge.md)
