# 游戏知识注入（常驻 + 实体工具 + 攻略检索）

日期：2026-10-28  
状态：**MVP 已实现**（L0 + L1 + 同步两段式；L2/L3 见 §7、§14 非 MVP）  
范围：Chat Brain 如何感知《蓝色星原》世界观 / 图鉴 / 搭配与攻略；**不**改 Yunzai 图鉴命令本身  
前置：

- Wiki → YAML：[../../04-wiki-data-and-cache.md](../../04-wiki-data-and-cache.md)
- 能力注入：[../../10-capabilities-and-stickers.md](../../10-capabilities-and-stickers.md)
- 画画工具面（同类声明）：[../../07-chat-brain-mainline.md](../../07-chat-brain-mainline.md)
- 记忆拒写 lore：[../../08-chat-brain-memory-layer.md](../../08-chat-brain-memory-layer.md)

产品深度：**攻略级**（图鉴事实 + 本地/Wiki 攻略材料做建议；禁止无依据编造数值）。

---

## 1. 问题

| 数据 | 体量（约） | 若整包塞 prompt |
|------|------------|-----------------|
| `lore/promilia.yaml` + `game-info.yaml` | ~17KB | 尚可，但全文浪费 |
| `hero.yaml` `101003`（悠悠） | 名片级 | 应常驻 |
| `hero` / `pet` / `item` / `spirit` / `accessory` | 合计 **>2MB** | 不可行 |

需求：

1. 悠悠常知世界观 + **自己的**角色信息（`101003`）。
2. 其余图鉴按需可查，且能走关联（角色↔元素/职业/阵营、套装 `relatedPet`、奇波进化等）。
3. 能做「xx 配什么奇波」类攻略回答，数据随 Wiki 刷新动态更新。
4. 与现有 `~指令`（`rulePrefix[0]`）能力说明共存：能聊、也能引导发指令看卡片。

---

## 2. 市面对照与选型

| 方案 | 要点 | 结论 |
|------|------|------|
| 整库塞上下文 | 简单 | 否决（体量） |
| 纯向量 RAG | 模糊问法好；多跳关系弱 | 仅作 L3 增强 |
| **实体工具 + 轻 RAG** | 常驻核心；`lookup`/`expand`；攻略另检索 | **采用** |
| 全量 GraphRAG | 噪声大、维护重 | 不做 |

对齐行业「游戏内助手」：游戏知识用检索/工具；事实来自权威库而非模型背诵。

---

## 3. 分层架构

```
L0 常驻 system（每轮开口）
  · 世界观短卡（promilia + game-info 摘要）
  · 悠悠名片（hero 101003）
  · 纪律：事实只信注入/工具；缺则不确定 + 引导 ~指令

L1 实体工具（模型声明 → 服务端查 YAML → 卡片回注）
  · lookup_entity / resolve_name / expand_links

L2 攻略检索
  · 本地 heroGuide 摘要（若有）
  · lore section 检索（已有 loreCache 能力，Chat 侧只读）
  · 回答标注「图鉴事实 / 攻略建议」

L3（后期）实体卡 + 攻略摘要 Embedding，服务模糊问法；关系仍以 L1 为准
```

**原则（与表情货架一致）**：没有打开的工具面，模型就不该假装查过。

---

## 4. 数据真相与刷新

| 层 | 路径 | 刷新 |
|----|------|------|
| 图鉴实体 | `data/game/{hero,pet,spirit,item,accessory,suit,element,groups,profession,nickname}.yaml` | 插件 Wiki `getData` / `#更新*`（现有） |
| Lore | `data/game/lore/{promilia,game-info}.yaml` | `wikiLoreRefreshHours` / bootstrap（现有） |
| 攻略图 | `heroGuidePath` 等配置目录 | 用户/挂载更新 |

Chat Brain **只读**上述文件（或经 Node 侧已暴露的只读 API）；**不**在 chat 进程里另爬 Wiki。

**mtime 缓存**：Python 侧按文件 mtime 热加载；更新 yaml 后下次 lookup 即新数据，无需重启（与 `help_capabilities` 同类）。

**记忆守卫不变**：群 MEMORY / extract **继续拒写** wiki lore 与数值，避免过期私货污染；游戏知识只走 L0–L2。

---

## 5. L0 常驻注入

### 5.1 世界观短卡

从 `promilia` / `game-info` 的 `sections[]` 抽取固定白名单章节（例：世界观、地区、阵营、种族、元素、职业），每段截断（建议单段 ≤400 字，合计硬顶 ~2.5K 字）。空 `text` 章节跳过。

输出块名：`【星原世界观】`。

### 5.2 悠悠名片

读 `hero.yaml["101003"]`（可用配置覆盖 id，默认 `101003`），压成：

- 名 / 英文名 / 稀有度  
- 元素、职业、阵营、种族、生日  
- `desc`/`intro` 截断  
- 技能名列表（不要整段倍率长文）  
- `nickname.yaml` 里该 id 的别名  

输出块名：`【悠悠自己｜图鉴】`。

### 5.3 纪律（system 一两句）

- 游戏设定与数值以本轮【星原*】/ 工具卡片为准。  
- 没有卡片就不要编；可引导 `~{rulePrefix 展示的指令}`（与 help 能力块一致，**不需要 @**）。  
- 攻略建议须标明是建议，并尽量引用工具返回的依据。

接入点：`mainline._build_messages`，紧接 `capability_block()` 之后（同为 system 追加）。

---

## 6. L1 实体工具面

### 6.1 模型声明（对齐 draw）

在 `replies` 中允许：

```json
{"type":"lookup","kind":"hero","q":"寒悠悠"}
{"type":"lookup","kind":"pet","q":"森彩灵蝶"}
{"type":"lookup","kind":"suit","q":"蝶语迷梦"}
{"type":"expand","from_kind":"hero","id":"101003","edges":["element","profession","group"]}
```

| 字段 | 说明 |
|------|------|
| `kind` | `hero` \| `pet` \| `spirit` \| `item` \| `accessory` \| `suit` \| `element` \| `group` \| `profession` |
| `q` | 名称 / 别名 / id 字符串 |
| `edges` | expand 时：`element` `profession` `group` `relatedPet` `evolution` 等白名单 |

同一轮最多 **2** 次 lookup/expand（防刷）。有 lookup 时：本轮可先短应答或不发言；服务端查完后 **同主线再进一轮人设**（类似 tool_done 收尾，但同步路径优先：防抖后一次「查→再生成」）。

**推荐实现（MVP）**：同步两段式（本轮解析到 lookup → 执行 → 带【工具结果】再调人设），不先上异步 job，降低复杂度。

### 6.2 服务端解析

模块建议：`server/src/chat/game_kb/`（或 `game_knowledge.py`）

| 函数 | 行为 |
|------|------|
| `resolve_name(q)` | `nickname.yaml` 反查 id；再扫各库 `name`/`englishName`/`page` |
| `load_entity(kind, id)` | 读对应 yaml，打成 **卡片**（字段白名单，去 icon 大字段） |
| `expand_links(card, edges)` | 跟 id/名去关联表；套装 `relatedPet` → pet 名片 |
| `summarize_lore()` | L0 短卡 |
| `self_card()` | 101003 |

查无：返回 `{ok:false, hint:"可让用户发 ~xxx图鉴"}`，人设据此引导，不编造。

### 6.3 与图鉴命令的边界

| 场景 | 行为 |
|------|------|
| 闲聊「悠悠你什么元素」 | L0 自己名片即可 |
| 「芙宁娜技能呢」且库中有对应角色 | L1 lookup → 短聊答复 |
| 用户要正式卡片/面板 | 引导 `~角色图鉴` / `~面板`（能力块已说明） |
| 正文已是游戏指令 | 现有 `is_game_command` skip，不进闲聊抢答 |

---

## 7. L2 攻略级

### 7.1 材料来源（按优先级）

1. **结构化依据**：L1 卡片（元素一致、职业定位、`suit.relatedPet`、奇波 tag/特性）。  
2. **本地攻略图**：配置 `heroGuidePath`；MVP 可先「按角色名匹配文件名 → 注入路径提示 + 引导 `~寒悠悠攻略`」；二期 VLM/人工摘要入库 `data/game/guide_summaries/{id}.md`。  
3. **Lore sections**：复用插件已解析的 `sections[].text`（Chat 侧 Python 读 yaml 或薄封装），`search_lore(query)` 返回 Top-K 段。

### 7.2 回答纪律

- 分清：**图鉴事实** vs **搭配建议**。  
- 建议必须能指回本轮工具/L0 中的字段；否则降级为「不确定，去发 `~xx攻略`」。  
- **禁止**编造具体伤害公式、未入库的「毕业配队」。  
- 社区第三方攻略源（非本仓）：**本期不做**；若以后加，必须带来源名与抓取时间。

### 7.3 工具扩展（二期）

```json
{"type":"guide_search","q":"寒悠悠 配队"}
{"type":"lore_search","q":"镜花洲"}
```

---

## 8. 主线接入（Chat）

1. `_build_messages`：system += `capability_block()` + `game_l0_block()`。  
2. `parse_persona_json`：识别 `lookup` / `expand` /（二期）`guide_search`｜`lore_search`。  
3. 若存在查询声明：执行 KB → 组装【工具结果】→ 二次人设（或合并进同轮 user 后再 generate）；**二次结果才出站**。  
4. Trace：`event=game_lookup` 记录 kind/q/ok/卡片摘要，便于复盘。  
5. 配置（建议）：

| 键 | 默认 | 含义 |
|----|------|------|
| `chatGameKbEnabled` | true | 总开关 |
| `chatGameSelfHeroId` | `"101003"` | 悠悠图鉴 id |
| `chatGameL0MaxChars` | 2800 | 常驻块硬顶 |
| `chatGameLookupMax` | 2 | 单轮最大查询 |

---

## 9. 错误与降级

| 情况 | 行为 |
|------|------|
| yaml 缺失 / 解析失败 | L0 省略该块；lookup 返回 ok:false |
| 名称歧义 | 返回候选列表（≤5），人设追问或列选项 |
| 查询超限 | 只执行前 N 个，其余告知未查 |
| 二次人设失败 | skip，不把工具 JSON 原文发出站（沿用非 JSON 空回策略） |

---

## 10. 测试计划

| 用例 | 期望 |
|------|------|
| L0 含「普罗米利亚」要点 + 寒悠悠元素/职业 | system 可见、体量 < 硬顶 |
| `lookup hero 寒悠悠` / 别名「唐悠悠」 | 命中 101003 卡片 |
| `expand suit` 带 relatedPet | 返回奇波名/id |
| 无此角色 | ok:false + 引导 ~图鉴 |
| `#`/`~` 游戏指令 | 仍 `game_command` skip |
| 非 JSON / 导演腔 | 不把工具草稿发出站 |

---

## 11. 分期

| 期 | 交付 |
|----|------|
| **MVP** | L0 常驻 + `resolve_name`/`lookup_entity`/`expand_links` + 同步两段式主线 + 单测 |
| **攻略** | `lore_search` + 本地攻略路径匹配/摘要；人设攻略纪律 |
| **增强** | Embedding 模糊检索；可选异步 job；面板开关 |

---

## 12. 非目标（本期）

- Chat 内重新爬 BWIKI  
- 把完整 `pet.yaml`/`item.yaml` 塞进 prompt  
- 用群友口述改写官方图鉴进 MEMORY  
- 替代 `~图鉴`/`~攻略` 出图命令（只互补闲聊）

---

## 13. 文档与索引（实现时改）

- 本规格  
- `docs/10-capabilities-and-stickers.md` 或新建 `docs/12-game-knowledge.md` 速查  
- `docs/yunzai-plugin-api-memory.md` 加一条结论  

---

## 14. 开放决策（实现前可微调，不阻 MVP）

1. 同步两段式 vs 异步 outbox（MVP 锁定同步）。  
2. 攻略图 VLM 摘要是否与表情 VLM 共用 vision profile（二期定）。  
3. `chatGameSelfHeroId` 是否进面板（建议要）。
