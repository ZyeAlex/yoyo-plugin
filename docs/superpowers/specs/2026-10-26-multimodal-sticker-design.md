# 多模态图片 + QQ 表情包缓存 / 斗图设计

日期：2026-10-26  
状态：实现完成  
范围：yoyo-plugin 入站媒体旁路 + yoyo-sauce Chat Brain 一轮视觉 / 表情包出站  
试验群：`1129762204`

## 1. 目标与非目标

### 目标

1. **普通图片 / 链接**：可配置；**纯图 / 纯链 / 纯表情不触发主模型**（触发策略 C）。
2. **一轮回复只调用一次主模型**；与现有 `chatLlmBaseUrl` + `chatLlmModel` 同链路做 vision（需网关模型支持 `image_url`）。
3. **多轮上下文带着图片/链接 URL（或落盘路径占位）**，由模型结合文案决定要不要「看」——实现上用「本轮是否注入 `image_url`」表达，不做第二跳 tool。
4. **QQ 表情包**：不经 chat 主线；旁路立刻下载 + **独立 VLM** 打标入库；回复时可按语境 / 斗图意愿检索发出。

### 非目标

- 不接 Mem0 / 外部云梗图市场为硬依赖（可后接 zip 导入）。
- 不做第二轮「先文字再 tool 看图」的主路径（与「一轮一次」冲突）。
- 不保证 `mface`（无下载 URL）能复原原图；无 URL 时只记 summary/id。
- 黄脸 `face` 仅做 id→含义表，不走 VLM。

## 2. 已确认约束

| 项 | 选择 |
|----|------|
| 视觉模型 | 与聊天同一 BaseURL/Model（配置项可后续拆 `chatVision*` 覆盖，默认跟 LLM） |
| 触发 | **C**：主动插话仍可对纯文字；纯图 / 纯链接 / 纯表情永远 skip；主动发起且带文字时，才把同条附件送进主模型 |
| 历史图 | 上下文**始终带链接/占位**；默认不反复烧 vision；若文案指代「刚才那张」且配置允许，本轮注入 recent ≤N 张 |
| 表情包 | 旁路缓存 + 独立 VLM；主线只见文字标签；出站检索发图 |

## 3. QQ 媒体类型

| QQ / OneBot | 处理 |
|-------------|------|
| `image` + 可下载 `url`（含多数动画表情，`summary`/`sub_type`） | 立刻下载落盘；若判为表情包 → 旁路 VLM 入库；若普通图 → 主线按策略挂链 / 注入 vision |
| `mface` | 无 URL：记录 `emoji_id` + `summary`，不可下载则跳过二进制缓存 |
| `face` | 映射为 `[黄脸:微笑(14)]` 类文本，不 VLM |
| 文本中的 http(s) 链接 | 进上下文占位；**单独链接消息不触发**；不默认抓网页正文（本阶段） |

**表情包判定（启发式，可配）：**

- `summary` 含「表情」或等于常见动画表情文案；或
- `sub_type` 非 0；或
- 边长较小且文件体积低于阈值（如 ≤ 512KB 且 max 边 ≤ 400，可配）

## 4. 架构

```text
群消息 (插件)
  │
  ├─ media ingest（旁路，异步，不阻塞 / 不触发 chat 判定）
  │    · 下载 image（rkey 会过期 → 必须立刻抓）
  │    · sha256 / 可选 pHash 去重
  │    · 表情包？→ sticker pipeline（独立 VLM）→ stickers 库
  │    · 普通图？→ media 缓存，供主线挂链 / 本轮 vision
  │
  └─ Chat Brain 主线（现有 should_respond）
       · C：无有效文字 → skip（即使有图/表情）
       · reply：assembler + 媒体占位；可选本轮 image_url≤N
       · 解析 replies 中的 sticker 意图 → 检索库 → 出站 image 气泡
```

插件与 server 分工：

| 层 | 职责 |
|----|------|
| 插件 | 透传完整 `message` 段；可选本机预下载失败时仍上报 url；发送 `type=image` 气泡 |
| server | 下载/哈希/VLM 入库、触发策略、vision 组装、sticker 检索与出站路径 |

## 5. 旁路表情包缓存

### 落盘

```text
server/data/stickers/
  files/{sha256}.{ext}     # 二进制
  index.sqlite 或 index.yaml
  # 每条：hash, path, emotion[], scene[], ocr_text, aliases[],
  #       summary, source_group, hits, last_used_at, created_at, phash?
```

- 同内容只 VLM 一次；再见到只 `hits++`。
- 库软上限默认 **120**，超限按 `hits` + 新鲜度淘汰。
- VLM 并发默认 **1**；失败记日志，条目可保留「未标注」稍后重试。

### 独立 VLM 调用

- **不**走 `GroupMainline` / `should_respond` / persona 气泡 JSON。
- Endpoint：默认跟 `chatLlm*`；可配 `chatStickerVlmModel`（空=跟主模型）。
- 输入：单张图 + 固定打标 system prompt。
- 输出严格 JSON，例如：

```json
{
  "emotion": ["无奈", "摆烂"],
  "scene": ["回嘴", "结束话题"],
  "ocr_text": "我不想干活",
  "aliases": ["摆烂", "摸鱼"],
  "usable_for": ["斗图", "附和"]
}
```

### 触发旁路的时机

- 白名单群内**每条**含候选 image/mface 的消息都可入队（与是否 @ 无关）。
- 与 chat 并行：`asyncio.create_task` / 插件 fire-and-forget `POST /api/media/ingest`。

## 6. 主线：图片链接与一轮 vision

### 上下文文本

对 recent / 当前消息渲染例如：

- `[图片 url=https://… path=.media/ab12.jpg]`
- `[表情包 id=ab12 描述=无奈|摆烂 ocr=我不想干活]`
- `[链接 https://…]`

### 何时注入 `image_url`（同一轮 `chat/completions`）

1. 本轮已决定 `reply`（主动发起或合规主动插话），且  
2. `chatVisionEnabled`，且  
3. 满足其一：  
   - 当前消息含普通图（非已入库表情包路径），或  
   - 文案命中指代（「这张图」「刚才那张」「看看」等）且 recent 有图  

上限：`chatVisionMaxImages` 默认 **2**。失败则降级为仅文本占位，**不阻断**文字回复。

### 表情包与主模型 vision

- 已入库表情包：**默认不再**对本条贴纸打主模型 vision（标签已够）；斗图发送走检索。
- 未入库、旁路未完成时：上下文可暂为 `[表情包 下载中]`，不阻塞主线。

## 7. 出站表情包 / 斗图

### 模型输出约定

在现有 JSON replies 上扩展（向后兼容）：

```json
{
  "replies": [
    {"type": "text", "text": "来啊来啊"},
    {"type": "sticker", "query": "无奈 摆烂"}
  ]
}
```

或 `{"type":"sticker","auto":true}`：用本轮 text 意图检索。

Persona 增加：可发表情包；斗图时优先 sticker；没有合适就只回文字；勿谎称发了图。

### Server 检索

1. `query` / 回复文本 → 关键词 +（可选）embedding 召回 topK。  
2. 重排：情绪契合、OCR、hits、**近期用过降权**。  
3. 相关度低于阈值 → 不发。  
4. 生成 `ReplyBubble(type="image", path=绝对路径)`；插件原样 `segment.image`。

### 斗图意愿

提高 sticker 倾向（仍须已通过 should_respond，**不因纯表情唤醒**）：

- 用户本条或 recent 连续发表情包；或  
- 文案含「斗图」「来张」「接一个」等；或  
- 主动 `@/唤醒` 且附表情。

配置：`chatStickerReplyEnabled`、`chatStickerMaxPerReply` 默认 1。

## 8. 配置键（草案）

```yaml
chatVisionEnabled: true
chatVisionMaxImages: 2
chatVisionIncludeRecentOnRefer: true

chatStickerCacheEnabled: true
chatStickerVlmModel: ""          # 空=跟 chatLlmModel
chatStickerLibraryCap: 120
chatStickerReplyEnabled: true
chatStickerMaxPerReply: 1
chatMediaMaxBytes: 8388608
```

面板：聊天 →「媒体 / 表情包」分组。

## 9. API（server）

| 方法 | 用途 |
|------|------|
| `POST /api/media/ingest` | 插件上报一段 message 媒体，旁路下载+表情包管道 |
| `GET /api/stickers/search?q=` | 运维 / 测试检索 |
| （可选）`POST /api/stickers/reindex` | 补打标 |

主路径仍是 `POST /api/chat`；ingest 失败不得影响 chat。

## 10. 测试与验收

- 纯图 / 纯表情 / 纯链接 → `skip`，但 ingest 仍可能入库。  
- `@悠悠` + 文字 + 普通图 → 一次 LLM，请求含 `image_url`（mock 可断言 messages）。  
- 同 hash 表情包第二次出现 → 不二次 VLM。  
- 回复 JSON 含 sticker query → 出站带 image path。  
- 试验群 `1129762204` 人工：发动画表情 → 库增长；斗图话术 → 回一张库内图。

## 11. 实现分期

1. **Media ingest + 落盘 + 占位渲染**（无 VLM）  
2. **触发 C + 一轮 vision 注入**  
3. **旁路 VLM 打标 + index**  
4. **sticker 出站 + 斗图启发式 + 面板配置**  
5. 规格回写进总设计文档交叉链接  

## 12. 决策记录

| 决策 | 选择 | 原因 |
|------|------|------|
| 主视觉 | 同 chat 模型 | 用户选定；部署已是 OpenAI 兼容 |
| 触发 | C | 省 token；图不刷屏叫醒 |
| 历史图 | 链接为主，指代才注入 | 一轮一次且可控 |
| 表情包 | 旁路 VLM + 检索发送 | 对齐 mio / dsh-meme；不占主线 |
| 出站 | JSON sticker → server 检索 | 主模型无需看库内二进制 |

## 13. 对照市面方案

- **dsh-qq-bridge**：立刻下载防 rkey 过期 → 本设计 ingest 必做。  
- **mio**：三维标签 + 向量 + 新鲜度 → 入库字段与重排对齐。  
- **dsh-meme**：`send_meme` / `learn_meme` → 出站 query / 旁路学习等价。  
- **不照搬**：其「多轮 tool 看图」；我们坚持单次 completion。
