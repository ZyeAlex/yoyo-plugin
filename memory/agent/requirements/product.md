# 产品目标

最后更新：2026-06-16

## 定位

YoAgent 是 **《蓝色星原：旅谣》QQ 群游戏助手 Agent**：

- 通过 HTTP API 与 **Yunzai-Bot** 插件交互，在群内 **扮演可配置角色**（伙伴/引导者人设）
- 处理群聊任务：答疑、查资料、攻略检索、数值查询、闲聊玩梗
- **Token-First**：入库 0 token；多数回复 1 次 LLM + 0~1 次本地查库

游戏背景见 [game-context.md](game-context.md)；资料接入见 [game-knowledge.md](game-knowledge.md)。

## 双重职责

| 职责 | 说明 |
|------|------|
| **角色扮演** | Persona 提示词 + 世界观用语；语气像游戏内伙伴，不 OOC |
| **资料助手** | 按需查本地游戏库（设定/角色/攻略/结构化数据），必要时 `web_search` 补官方动态 |

## 技术方向

- **API 层**：FastAPI；入库路径 0 token
- **Agent**：Harness + 纯 ReAct loop；ContextAssembler 按需 playbook
- **LLM**：OpenAI 兼容 API；主模型回复，路由可规则化
- **游戏资料**：SQLite + FTS5 + 结构化表；**默认无在线 embedding**
- **群聊记忆**：Mem0 云 API（可选）；只记用户偏好，不记 wiki
- **外网**：Jina Reader 搜索（公告/新闻补充）

## 第一优先级

1. **省 token**（见 [token-strategy.md](token-strategy.md)）
2. **2 核 4G 可部署**（不本机跑 BGE-M3）
3. **资料准确**（结构化 SQL + FTS，禁止编造数值）

## 阶段划分

| 阶段 | 目标 |
|------|------|
| **MVP-A** | 基础 Agent 循环 + `web_search` + 提示词管理 |
| **MVP-B** | 游戏库 schema + 导入管线 + FTS |
| **MVP-C** | 游戏工具 + Persona 增强 |
| **MVP-D** | Yunzai 群 API + Mem0 用户记忆 + SSE |
| **演进** | 离线小模型向量 fallback、后台 CMS 同步、Eval |

## 非目标（当前）

- 不直接对接 QQ 协议（Yunzai 插件负责）
- 不做通用文档 RAG 审阅（playbook 那套 BGE-M3 漏斗 **不**作为默认路径）
- 不在请求路径调用在线 Embedding API
- 不爬虫维护第三方 wiki（资料由运营导入）
