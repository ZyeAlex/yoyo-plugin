# 向量索引（本地 SQLite + Embedding + FTS5）

最后更新：2026-06-30

## 原则

- **真相源**：`data/game/*.yaml`、群 `memory/data/**`；向量库为派生产物，不进 git（`data/index/`）。
- **多安装实例**：每套 Yunzai 各自拉 Wiki → 本地 YAML → 按本机 embedding 配置建库。
- **热路径只读库**：`/api/chat` 不批量调 Embedding API；建库在后台队列完成。

## 配置（config/config.yaml）

| 字段 | 默认 | 说明 |
|------|------|------|
| `agentApiProvider` | siliconflow | 统一供应商（LLM + Embedding） |
| `agentLlmApiKey` | "" | 共用 API Key |
| `agentLlmBaseUrl` | "" | 仅 `custom` 时填写 |
| `agentLlmModel` | 见预设 | LLM 模型 |
| `agentEmbeddingModel` | 见预设 | Embedding 模型 |
| `agentEmbeddingDim` | 见预设 | 向量维度 |

### 内置常量（settings.py）

| 项 | 值 |
|----|-----|
| 检索 top-k | **6** |
| daily log 索引 TTL | 7 天 |
| 记忆写入 debounce | 10 秒 |

## 存储

```
data/index/
├── manifest.json      # 源/embedding 指纹与状态
└── knowledge.vec.db   # SQLite：vec_chunks + vec_chunks_fts (FTS5) + embedding BLOB
```

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/index/status` | manifest + ready |
| POST | `/api/index/notify` | `{ scope: game\|memory\|all, group_id? }` |
| POST | `/api/index/rebuild` | `{ scope: all\|game\|memory }` |

插件：`#更新*` / lore 刷新成功后 `notifyIndex({ scope: 'game' })`；主人 `#重建知识索引`。

## 检索

- **游戏**：`search_knowledge` → `hybrid_search`（FTS top-N + 向量 top-N → RRF 融合）。
- **索引未 ready 或 Embedding 未配置**：工具返回明确错误，**不降级**到 YAML 子串或空结果。
- **记忆**：`memory_search` → 纯向量检索；同样要求索引就绪。
- 单段展示上限 **800 字**；命中附带 `[source:entity:id]` 或 lore 章节来源。

## 文档切片（game scope）

| scope | 来源 | 说明 |
|-------|------|------|
| `game_lore` | lore YAML 章节 | ≤900 字整节；长节 900 字滑动窗口 + 128 overlap |
| `game_entity` | hero/pet/spirit/item/accessory/profession | 统一模板，含 filter 字段 meta |

构建：`doc_builder.py` ← `index/chunkers/game.py`。

## 代码落点

| 模块 | 路径 |
|------|------|
| 索引核心 | `server/src/agent/index/` |
| doc_builder | `server/src/agent/knowledge/doc_builder.py` |
| 工具 | `search_knowledge.py`、`get_entity_detail.py`、`query_game_data.py` |
| 配置 | `server/src/core/settings.py` |
| API | `server/src/api/endpoints/index.py` |
| 插件 notify | `api/agent/client.js`、`utils/game.js`、`api/wiki/loreCache.js` |
