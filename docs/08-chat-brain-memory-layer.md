# Chat Brain 记忆层

> 主线总览：[`07-chat-brain-mainline.md`](./07-chat-brain-mainline.md)  
> 规格 §9.5：[`superpowers/specs/2026-10-26-qq-group-chat-brain-design.md`](./superpowers/specs/2026-10-26-qq-group-chat-brain-design.md)

---

## 1. 原则

- 记忆是主线的**输入/输出**，**不开第二会话**
- **读同步**（reply 前注入）；**写异步**（气泡成功后 `asyncio.create_task`），不拖慢回复
- Token-First：注入有硬字符上限；向量默认可关，关/失败则关键词回退
- **按群隔离**用户画像（防串台）
- 守卫：游戏 lore / 数值 / API Key / 提示词 / 工具实现细节 **不进** MEMORY

运行数据根：`server/data/memory/`（gitignore；保留 `.gitkeep`）。  
**勿与**开发文档库 `docs/`（本系列专题）混淆。

---

## 2. 落盘布局

```text
server/data/memory/
  global/MEMORY.md
  group/{group_id}/
    MEMORY.md          # 群画像
    users.yaml         # 用户画像
    slang.yaml         # 黑话
    session.jsonl      # 跨轮问答（滚动，仅悠悠开口的轮）
    transcript.jsonl   # 群里每一条可读对白（含没回复的）
    heat.json          # 冷热温度
    logs/YYYY-MM-DD.md # 日誌
    index/             # 分片元数据（可选）
  index/
    memory.vec.db      # sqlite 向量（全群）
```

**users.yaml**（每 user_id）：`nickname`, `alias`, `preferences[]`, `taboos[]`, `notes[]`, `from_others[]`, `updated_at`  
**slang.yaml**：`{ term, meaning, examples[], hits, created_at }`  
**session.jsonl**：每行 `{ts, user_id, user_text, bot_replies[]}`，按 `chatSessionHistoryTurns` 截断

---

## 3. 代码包 `server/src/chat/memory/`

| 模块 | 职责 |
|------|------|
| `paths.py` | 路径 |
| `store.py` | MEMORY / users / slang / session / daily |
| `guards.py` | 拒写规则 |
| `slang.py` | 命中扫描 + 「X 是什么意思」检测 |
| `retrieve.py` | 关键词 + 向量混合 |
| `embedder.py` | OpenAI 兼容 embeddings |
| `vector_store.py` | sqlite 存 embedding blob + 余弦 |
| `assembler.py` | 按预算拼注入块 |
| `extract.py` | 回复后 LLM 结构化抽取 → guards → store |
| `scheduler.py` | 轻量日终占位（启动可扫昨日 log） |

主线挂钩（`mainline.py`）：

1. `_build_messages` → `build_memory_context` 注入 system  
2. reply 成功 → `append_session` + `schedule_extract_memory`  
3. 首次 `get(session)` → `session.jsonl` 预热 timeline  
4. 主动发起 + `记住：` / `忘记：` → 同步 `store`（不经 LLM）

---

## 4. 注入顺序（system）

1. persona  
2. 群画像（截断）  
3. 当前发言者用户画像  
4. 命中黑话释义  
5. 长期检索命中（≤ topK）  
6. 今/昨日誌摘要  
7. （user 侧）近期群聊 + timeline + 当前句 + jobs  

总预算：`chatMemoryMaxInjectChars`（默认 900）。

---

## 5. 读写时序

**读（同步）**：load 画像 → match slang → hybrid retrieve → assembler 裁剪  

**写（异步）**：extract JSON `{group_facts, user_updates, slang, daily_note}` → guards → merge → daily append → 可选向量 index → session 已在 reply 路径 append

Embedding 失败：打日志，降级关键词，**不阻塞**气泡。

---

## 6. 配置键（默认）

```yaml
chatMemoryEnabled: true
chatSessionHistoryTurns: 20
chatMemoryMaxInjectChars: 900
chatGroupMemoryCharLimit: 2200
chatUserMemoryCharLimit: 800
chatDailyLogInjectChars: 600
chatSlangEnabled: true
chatSlangMaxInject: 8
chatExtractEnabled: true
chatEmbeddingEnabled: true
chatEmbeddingModel: BAAI/bge-m3
chatEmbeddingBaseUrl: ""   # 空=跟 LLM
chatEmbeddingApiKey: ""    # 空=跟 LLM
chatEmbeddingDim: 1024
chatRetrieveTopK: 4
```

面板：群聊 →「记忆」分组。运维：`POST /api/memory/reindex`（body: `{group_id}`）。

---

## 7. 测试

| 文件 | 覆盖 |
|------|------|
| `test_memory_store.py` | 读写落盘 |
| `test_memory_guards.py` | lore 拒写 |
| `test_memory_assembler.py` | 预算 / 黑话注入 |
| `test_memory_retrieve.py` | 关键词 + mock 向量 |
| `test_memory_extract.py` | mock LLM 抽取 |
| `test_mainline_memory_inject.py` | reply 含画像、记住指令、session 预热 |

---

## 8. 改动守则（给 AI）

1. 新记忆字段先改 `store` + guards，再改 assembler / extract。  
2. 不要在请求路径同步 await 在线 embedding（失败必须可降级）。  
3. 不要跨群合并 users.yaml。  
4. 不要把运行时 `server/data/memory/**` 提交进 Git。  
5. 代码变更后同步本专题 + 规格 §9.5。
