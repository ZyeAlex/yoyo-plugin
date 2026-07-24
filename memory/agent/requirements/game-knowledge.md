# 游戏资料接入与检索架构

最后更新：2026-06-30

> 游戏事实 **禁止** 写入 MEMORY（见 `memory/guards.py`）。检索以 **向量 + FTS 混合** 为主，结构化筛选为辅。

## 当前实现

**数据源**：插件 `data/game/*.yaml`（Wiki 拉取缓存）。YoAgent 只读 YAML；离线切片写入 `data/index/knowledge.vec.db`（向量 + FTS5）。

| 模块 | 路径 | 说明 |
|------|------|------|
| 路径解析 | `src/agent/knowledge/paths.py` | 定位插件 `data/game/` |
| 加载缓存 | `src/agent/knowledge/store.py` | `GameDataStore` |
| 文档切片 | `src/agent/knowledge/doc_builder.py` | lore 滑动窗口 + 全实体 chunk |
| 混合检索 | `src/agent/index/search.py` | FTS + 向量 RRF；索引未就绪时返回明确错误 |
| 格式化 | `src/agent/knowledge/format.py` | `format_search_hits` / `format_query_results` |
| 工具 | `search_knowledge` | 设定、名词、实体概述 |
| 工具 | `query_game_data` | 结构化条件列表（无 `entity=auto`） |
| 工具 | `get_entity_detail` | 单条完整技能与数值 |
| 工具 | `web_search` | 外网补充 |

### 工具分工

| 工具 | 用途 |
|------|------|
| `search_knowledge` | 「奇波是什么」、世界观、阵营、实体概述 |
| `query_game_data` | 火属性奇波列表、5 星角色筛选等 |
| `get_entity_detail` | 按 id/name 拉单条 hero/pet/… 全量 YAML 数值 |
| `web_search` | 本地未收录且需外网资讯 |

`query_game_data` 的 `filters.name` 仅作辅助精确筛选；完整数值请 `get_entity_detail`。

### 索引同步

- `#更新*` / Wiki 拉取成功后 `notifyIndex({ scope: 'game' })`
- `api/wiki/loreCache.js` 背景页刷新后同样 notify
- 主人 `#重建知识索引` 或 Web 面板重建

### 验收

- [x] `tests/test_game_knowledge.py` — 加载、筛选、doc_builder、新工具
- [x] `tests/test_search_hybrid.py` — hybrid + 索引不可用报错
- [x] `tests/test_index_chunkers.py` — 全 entity + lore 长 chunk

详见 [`vector-index.md`](vector-index.md)。
