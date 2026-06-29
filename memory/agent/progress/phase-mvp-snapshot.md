# 阶段总览

最后更新：2026-06-26  
**状态**：进行中 — 游戏助手 Agent（蓝色星原：旅谣）

## 目标

QQ 群内的 **角色扮演 + 游戏资料助手**，2 核 4G 可部署，Token-First，资料本地检索（默认无在线 embedding）。

## 已完成

- [x] Token-First 架构文档（持续按实现更新）
- [x] yoyo-plugin 对接：`POST /api/chat` + OneBot 解析 + 唤醒词
- [x] AgentRunner + 渐进工具 ReAct loop
- [x] 游戏资料 YAML + `get_lore` / `query_game_data`
- [x] 记忆 MEMORY/users/logs + memory 工具
- [x] Session 多轮历史
- [x] **上下文重构（2026-06-24）**：core + playbooks、`ContextAssembler`、纯 ReAct、guards、ExtractMemory、情绪不落盘  
  → 详见 [phase-context-refactor-2026-06.md](phase-context-refactor-2026-06.md)
- [x] structlog 风格 trace（`route`、`system_chars`、`playbooks` 等）

- [x] **P0 真机可靠性（2026-06-26）**：同群 `try_claim` + 插件 inFlight 追发 `/api/messages`；ReAct 按 step 限时（简单 20s / 复杂 60s）；`maxSteps=8`；无整次 chat 总体超时

## 进行中

## 待办

### MVP-B（游戏资料库）

- [ ] SQLite FTS 替代 YAML 线性扫描
- [ ] `scripts/import_game_data.py`

### MVP-C（增强）

- [ ] 群 Persona DB 或独立 persona 注入策略
- [ ] Mem0 云 API（可选）

### MVP-D（工程）

- [x] 同群串行（server `try_claim` + 插件 `sessionQueues` / `inFlight`）
- [x] 追发 `POST /api/messages`（插件 inFlight 入队）
- [x] SSE 流式（插件侧已接；busy 时 `event: queued`）
- [ ] Token 预算压缩阶梯落地

## 模块状态快照

| 模块 | 状态 |
|------|------|
| `POST /api/chat` | **可用** |
| ContextAssembler + playbooks | **可用** |
| 纯 ReAct loop + activate_tools | **可用** |
| memory guards + async extract | **可用** |
| web_search (Jina) / vision / emoticon | **可用** |
| 游戏资料 YAML 工具 | **可用** |
| ~~IntentRoute 关键词分流~~ | **已否决并删除** |
| SQLite FTS | 未开始 |
| Mem0 云 | 未开始 |
