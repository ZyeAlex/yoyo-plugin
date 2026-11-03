# 表情包货架感知：保存 → 发送全链路

日期：2026-10-27  
状态：已实现（待试验群验收）  
范围：旁路入库、主线感知、候选注入决策、出站与 transcript 回写  
前置：[`2026-10-26-multimodal-sticker-design.md`](./2026-10-26-multimodal-sticker-design.md)（多模态 + 表情包初版）  
决策分叉：**候选注入（一轮 completion）**；漏选策略 **B**（只文字，不服务端偷偷塞图）  
频率 / 货架按需注入（已实现）：见 [`2026-10-28-sticker-frequency-design.md`](./2026-10-28-sticker-frequency-design.md)。原「每次开口注入」已改为斗图必开 + `chatStickerShelfChance`。

---

## 1. 目标与非目标

### 目标

1. **存/发不干扰正常交流**：ingest 异步失败不影响 `/api/chat`；纯表情不叫醒；发图失败不阻断文字气泡。
2. **知道收到了表情包**：主线上下文用可读短标签，而不是裸 URL 或静默丢失。
3. **知道该不该发、发哪张**：本轮注入带描述的候选货架；模型显式选 `sticker_id` 或 `none`。
4. **知道发了什么**：出站成功后把「已发：短描述」写回 timeline / transcript；禁止嘴上答应却无图且无交代。

### 非目标

- 不为表情包增加第二轮 tool（不照搬 dsh-meme 的 `send_meme` 工具循环）。
- 不接外部梗图市场为硬依赖。
- 不保证无 URL 的 `mface` 能复原原图。
- **不做**服务端在模型漏选时自动抽图发出（策略 B）。

### 验收标准（可测）

| ID | 场景 | 期望 |
|----|------|------|
| A1 | 白名单群发动画表情 | ingest 落盘 + VLM 成功 → 进可发表货架；主线可稍后看到标签 |
| A2 | VLM 失败 | 不进货架；主线最多见 `[表情包 未识别]`；chat 仍正常 |
| A3 | `@悠悠` + 普通闲聊 | 货架可注入。模型写文字就发文字，不因为有货架就改成只发图 |
| A4 | `@悠悠 发个表情包` 且货架有货 | 模型选 id → 出站 image。若同时写了文字，文字也发 |
| A5 | 同上但模型选 `none` / 漏选 | **仅文字**；文案须承认没发（persona 约束）；**不**自动塞图 |
| A6 | 候选 id 伪造 / 过期 | 丢弃该 sticker 气泡；文字照发；不报崩溃 |
| A7 | 纯表情消息 | `media_only` skip；ingest 仍可跑 |

---

## 2. 市面对照与选型

| 参考 | 采纳 | 不采纳 |
|------|------|--------|
| dsh-qq-bridge | 立刻下载防 rkey；表情目录与聊天认知分离；发出路径必须持久 | 多轮 agent 工具链 |
| dsh-meme | 先有「带描述候选」再发；发不出不装；learn/send 职责分离 | `send_meme` 工具第二跳 |
| mio 类标签 | emotion / scene / ocr / aliases + 新鲜度降权 | 强依赖向量库（本期可选，非必须） |

**本方案核心：候选注入 = dsh-meme「货架可见」+ 你们现有「一轮 JSON replies」。**

---

## 3. 架构

```text
群消息 (插件白名单)
  │
  ├─【旁路】POST /api/media/ingest（异步，不阻塞 chat）
  │    download → classify → VLM(vision profile) → sticker_store
  │    仅「已标注」进入 shelf（可发表货架）
  │
  └─【主线】POST /api/chat
       should_respond / heat（不变）
       → 装配 messages：
            · 收到表情 → 短标签占位
            · 每次开口注入【可发表情候选】≤K，发不发由模型自己写
            · 模型写了文字就发文字，选了 id 就发图，两个都写就都发
       → 一轮 LLM → JSON replies
       → resolve：sticker_id → path（仅本轮注入过的 id）
       → 插件发 text / image
       → timeline + transcript 回写「已发表情：…」
```

### 模块边界

| 单元 | 职责 | 依赖 | 不做 |
|------|------|------|------|
| `media/ingest` | 下载、分类、打标、upsert/淘汰 | vision settings、store | 不调主线 |
| `sticker_store` | 索引、`search`、`shelf`（候选）、`mark_used` | sqlite 文件 | 不发 QQ |
| `mainline` 装配 / resolve | 占位、注入候选、解析 id、回写 | store、persona | 不直接 VLM |
| 插件 `reply` | `segment.image(path)` | 出站 path | 不理解标签 |

---

## 4. 入库（旁路）

### 4.1 时机

- 白名单群内，插件在 `runChat` 里对每条消息 fire-and-forget `ingestMedia`（保持现状）。
- ingest 与 `/api/chat` **并行**；任一失败互不影响。

### 4.2 分类

判为 sticker 的启发式（在初版上收紧「可发表」、放宽「可下载」）：

- `summary` 含「表情」，或 `sub_type ≠ 0`，或小图启发式（可配）；
- `mface`：**有 http(s) URL 则下载并走 sticker 管道**；无 URL 只记文本占位，不进货架；
- `face`（黄脸）：仅文本映射，不进货架；
- 普通 `image`：进 `data/media`，供 vision，**不进**表情货架。

### 4.3 打标

- 调用 **vision profile**（`chatVisionBaseUrl` / `ApiKey` / `Model`）。
- 禁止用纯文本聊天模型硬打图（避免 `At most 0 image(s)`）。
- 输出 JSON：`emotion[]`、`scene[]`、`ocr_text`、`aliases[]`、`usable_for[]`。
- **成功** → upsert 货架；**失败** → 删除本次缓存文件（或移入 pending，默认不对主线 shelf 可见），打日志。
- 同 hash 已标注：只 `hits++`，不二次 VLM。
- VLM 并发默认 1。

### 4.4 货架与容量

- 软上限 `chatStickerLibraryCap`；淘汰：低 hits + 旧 `created_at`。
- 「可发表货架」= 标签通过 `_tags_labeled` 的行；stub / failed **不可被 shelf/search 选中**。

---

## 5. 感知：收到了什么

### 5.1 占位渲染

对 message / recent / transcript 行：

| 状态 | 渲染 |
|------|------|
| 已入库且有标签 | `[表情包 {短名}｜{emotion 前2}]`，短名优先 `ocr_text` / 首个 alias |
| 下载中或未识别 | `[表情包]` 或 `[表情包 未识别]` |
| 普通图 | `[图片 …]`（与初版一致） |

主线 `_build_messages` / heat transcript **共用同一套短标签逻辑**，避免两边描述不一致。

### 5.2 与策略 C 的关系

- 纯表情 / 纯图 / 纯链：仍 `skip`（不叫醒）。
- 旁路仍可 ingest；用户稍后用文字点名时，recent 里已有短标签，模型「知道刚才那张是什么氛围」。

---

## 6. 决策：候选注入（一轮）

### 6.1 何时注入

满足任一即注入（K 默认 **5**，可配 `chatStickerShelfSize`）：

1. 用户文案命中斗图意图：`斗图|来张|接一个|表情包|发个.*表情` 等；
2. 本条或 recent 窗口内出现 sticker 段；
3. 主动发起（@ / 唤醒 / 回 bot）且本条带 sticker。

无上述倾向时：**不注入货架块**，减少干扰闲聊。

### 6.2 候选如何挑选

1. `search(用户句 + 最近表情短名)` → 按分排序；
2. 不足 K 条时用 `shelf()` 补齐：已标注、按 hits/新鲜度，**10 分钟内刚用过的降权**；
3. 本轮分配稳定短 id：`s1`…`sK`，仅内存映射 `id → hash/path/短描述`，不持久化 id。

注入示例：

```text
【可发表情·本轮最多选 1 张】
- s1 菜到安详｜自嘲/摆烂
- s2 …
规则：用 {"type":"sticker","id":"s1"} 选一张；没有合适用 {"type":"sticker","id":"none"} 或不选。
禁止说「发了」「给你整一个」却不选 id；禁止编造 id。
```

### 6.3 模型输出约定

```json
{
  "replies": [
    {"type": "text", "text": "短句"},
    {"type": "sticker", "id": "s1"}
  ]
}
```

- 表情气泡只认货架 `id`；无 id / `none` / 不在货架内则不发。
- Persona / Extra 提示与上表一致；默认示例 JSON **必须包含** sticker 字段说明，避免模型只学 text。

### 6.4 策略 B：漏选 / none

| 情况 | 行为 |
|------|------|
| 显式 `id: none` | 不发图；若文案谎称已发，server **不改写文案**（靠 prompt 约束）；可选 debug 计数 |
| 漏选且文案含「发了/整一个/给你一张」等 | **仍不发图**；实现期可在 Extra 加强；不自动塞图 |
| 货架为空仍要表情 | 仅文字；prompt 写明「货架空，勿承诺发图」 |
| 选了非法 id | 丢弃 sticker 气泡，文字照发 |

**禁止** `boost_dou_tu` 在模型未选 id 时 `pick_any` 出站（与本期前的临时兜底补丁相反；落地时删除该路径）。

---

## 7. 发出与回写

### 7.1 Resolve

1. 遍历 replies：`text` → 文本气泡；`sticker.id` ∈ 本轮映射 → `ReplyBubble(type=image, path=…)`。
2. 路径必须落在 `data/stickers` 或 `data/media`（延续路径禁闭）。
3. 每轮最多 `chatStickerMaxPerReply`（默认 1）。
4. 成功出站前/后 `mark_used(hash)`。

### 7.2 插件

- 保持 `segment.image(path)`；失败打日志，**不重试阻塞文字**。

### 7.3 「知道自己发了什么」

出站成功后：

1. `timeline` 写入 bot 回合时，image 气泡带 `sticker_desc`（短名）；
2. `transcript` 追加一行：`悠悠: [表情包 菜到安详]`（与入站标签同形）；
3. `session.jsonl` 的 `bot_replies` 可存 `["短句", "[表情包 菜到安详]"]`，便于抽取与排障。

发失败：不写「已发」行；文字回合照常写入。

---

## 8. 配置

| 键 | 默认 | 说明 |
|----|------|------|
| `chatStickerCacheEnabled` | true | 旁路入库 |
| `chatVision*` | （已有） | VLM / 主视觉 |
| `chatStickerLibraryCap` | 120 | 库上限 |
| `chatStickerReplyEnabled` | true | 允许出站表情 |
| `chatStickerMaxPerReply` | 1 | 每轮最多张数 |
| `chatStickerShelfSize` | 5 | **新增** 候选条数 |
| `chatStickerShelfEnabled` | true | **新增** 关闭则不注入候选（出站也关闭更安全） |

面板：智能体配置 →「表情包旁路」分组补充 shelf 两项说明。

---

## 9. 与现网差异（迁移）

| 现网问题 | 本设计 |
|----------|--------|
| 盲 `query` 整库搜，对不上静默 | 只从本轮候选选 id |
| 模型答应发图却无图 | Prompt 禁止虚诺；B：漏选不塞图 |
| 未标注 stub 占库 | 失败不进货架 |
| VLM 跟文本模型 | 强制 vision profile |
| transcript 几乎无「发出的表情」 | 统一短标签回写 |
| 临时 `boost + pick_any` 补丁 | **移除**，改候选注入 |

兼容：旧库中已标注条目直接进货架；旧 stub 启动时可 `purge_unlabeled` 一次。

---

## 10. 测试计划

- 单测 `sticker_store.shelf` / 降权 / 不返回 unlabeled。
- 单测装配：斗图意图才含「可发表情」块；候选 id 映射。
- 单测 resolve：合法 id → image；非法 / none / 漏选 → 无 image（B）。
- 单测回写：成功 image → transcript 行含短名。
- 集成：mock LLM 返回 `sticker.id=s1` → 插件层收到 path。
- 回归：纯文本闲聊、无候选注入时 token 结构与现网一致（无多余货架块）。

---

## 11. 实现分期

1. **Store**：`shelf()`、purge unlabeled、vision 打标路径确认。  
2. **感知**：统一短标签渲染（mainline + transcript）。  
3. **候选注入 + persona/JSON 约定**；删除 boost 自动 pick_any。  
4. **Resolve by id + 回写**。  
5. **面板配置项 + 试验群验收（A1–A7）**。

---

## 12. 决策记录

| 项 | 选择 | 原因 |
|----|------|------|
| 决策形态 | 候选注入，一轮 completion | 满足「知道货架」且不破坏一轮一次 |
| 漏选 | **B：不自动塞图** | 诚实；避免随机图答非所问 |
| VLM | vision profile | 修复文本模型拒图 |
| 货架可见性 | 仅已标注 | 检索可解释、可发送 |
| 回写 | timeline + transcript 同形标签 | 闭环「知道发了什么」 |
