# 角色外观工具 + 可选画画参考（解耦）

日期：2026-10-28  
状态：**已批准方向，待实现**  
范围：Chat Brain 按需获取《蓝色星原》角色本地立绘/外观，供闲聊描述或后续画画参考；**不**改 Yunzai 图鉴命令本身  
前置：

- 画画主线 / draw job：[../../07-chat-brain-mainline.md](../../07-chat-brain-mainline.md)
- 游戏知识 lookup 二段式：[2026-10-28-game-knowledge-injection-design.md](./2026-10-28-game-knowledge-injection-design.md)
- 本地角色图：`utils/game.js` → `getHeroImgs()`（`resources/img/hero/{名}/` + 配置 `imgPath`）

---

## 1. 问题

用户：「画一张你的图片」/「按寒悠悠长相画一张赛博风」。

现状：

- 画画：`{"type":"draw"}` → 有用户图则改图，否则文生图；参考只来自**用户消息**里的普通图。
- 角色图：Node `getHeroImgs` 已能扫到本地图（如 `寒悠悠` → id `101003`，多张），Chat 侧**未接入**。
- 若把「查外观」绑进 draw：工具面耦合、难只问长相不画。

需求：

1. **解耦**：外观查询是独立工具；画画仍是独立工具。
2. 工具结果给人设的是 **描述 +「可参考」标记**，**不**把整图塞进模型上下文。
3. 人设若选择按角色长相画：`draw` 声明 `use_ref:true`，服务端再把上次 look 的本地图挂进改图 `sources`。

---

## 2. 选型

| 方案 | 要点 | 结论 |
|------|------|------|
| 查外观时直接改图画完 | 耦合；只问长相也触发画 | 否 |
| 描述 + 整图进【工具结果】 | 模型难用图；费 token | 否 |
| **desc 进工具结果 + session 藏 path；draw 可选挂载** | 解耦清晰，对齐 lookup 二段式 | **采用** |

---

## 3. 架构

```
人设 JSON
  {"type":"look","q":"寒悠悠"|"self"|""}
       │
       ▼
同步二段式（与 lookup/expand 同类）
  run_look → Node/本地 getHeroImgs 随机一张
           → VLM 短 desc（失败则用 hero 名片 + 文件名兜底）
           → ml.pending_look_ref = {hero_id, path, name, ts}
           → 【工具结果】只含 desc / ref_available / hint
       │
       ▼
人设第二轮
  只聊外观 → text
  要画     → {"type":"draw","prompt":"…","use_ref":true}
       │
       ▼
_start_draw_job
  use_ref 且无用户 photo → sources=[pending_look_ref.path]
  有用户 photo → 仍优先用户图（look ref 不抢）
  画完 / 超时 → 清 pending_look_ref（只保留最近一次 look）
```

原则（与表情货架、图鉴 lookup 一致）：**没有打开的工具面，就不要假装查过 / 画过。**

---

## 4. 气泡契约

### 4.1 `look`（新）

```json
{"type":"look","q":"寒悠悠"}
```

| 字段 | 说明 |
|------|------|
| `q` | 角色名 / 图鉴 id / `self` / 空。空或 `self` → `chatGameSelfHeroId`（默认 `101003`） |

- **不计入** `max_replies` 文字预算（与 sticker/draw/lookup 相同）。
- 每轮至多 `chatHeroLookMaxPerTurn`（默认 1）条 look；与 lookup **分计**（lookup 仍用 `chatGameLookupMax`）。
- 同轮执行序：先跑完所有 look/lookup 工具气泡并注入【工具结果】→ 二段式 → strip 工具气泡 → 再处理 draw（与现有 lookup 优先于 draw 一致）。

### 4.2 工具结果（进模型）

```json
{
  "ok": true,
  "kind": "hero_look",
  "id": "101003",
  "name": "寒悠悠",
  "desc": "短外貌要点（≤200 字）",
  "ref_available": true,
  "hint": "若要按此角色长相画画：replies 加 {\"type\":\"draw\",\"prompt\":\"场景与画风\",\"use_ref\":true}；不要空口编五官。"
}
```

失败：

```json
{
  "ok": false,
  "kind": "hero_look",
  "id": "",
  "name": "",
  "desc": "",
  "ref_available": false,
  "hint": "本地没有该角色立绘；可换名字或引导用户发图当参考。"
}
```

**禁止**把 `path` / base64 / 长 URL 写入【工具结果】正文。

### 4.3 `draw` 扩展

现有：

```json
{"type":"draw","prompt":"…","size":"可选"}
```

新增可选：

```json
{"type":"draw","prompt":"赛博朋克街头，换画风保留长相","use_ref":true}
```

| 字段 | 说明 |
|------|------|
| `use_ref` | `true` 时尝试挂载 `pending_look_ref`；无 ref 则退化为文生图，并在 ack/日志标明 |

---

## 5. 数据与解析

### 5.1 图片来源

- 真相：与 `game.getHeroImgs()` 相同目录约定  
  `resources/img/hero/{目录名}/` + `config.imgPath` 下同名结构；`getHeroId(dir)` 映射到图鉴 id。
- Chat 访问方式（**锁定**）：Node 侧用现有 `getHeroImgs` / `getHeroId` 真相，经 Yunzai→Chat 已有旁路或新增只读接口返回 `{ok,id,name,abs_path}`；Python 将选中文件 copy 到 `server/data/media/looks/{session}/{hero_id}.ext` 供改图读取。不在 Python 复刻目录扫描与 `getHeroId`。

随机：对该 id 的图片列表过滤后缀 `jpg|jpeg|png|webp|gif` 后 `random.choice`。

### 5.2 `desc` 生成

1. 优先：现有 vision/VLM 对选中图出 ≤200 字外貌要点（五官/发色/服装/气质；禁止剧透数值）。  
2. 失败：拼接 `hero.yaml` 名片短字段（name/race/元素）+「以参考图为准」；`ref_available` 仍可为 true。

### 5.3 Session 状态

`GroupMainline.pending_look_ref`：

```text
{ hero_id, name, path, ts }
```

- 每次成功 `look` 覆盖。  
- `draw` 成功启动改图 job 后可清除，或 job done 时清除。  
- 进程重启丢失可接受（MVP）。

---

## 6. 人设 / 系统提示

- persona：可声明 `look`；要按角色长相画时先 look 再 `draw`+`use_ref`；不要空口编立绘细节。  
- 系统：与 lookup 工具面并列一行示例；默认 self = 悠悠。  
- 「画一张你」→ look(self) → 再 draw use_ref。

---

## 7. 非目标（本期）

- 奇波 / 道具外观  
- 多角色同框自动拼 ref  
- look 结果写入 MEMORY  
- 强制每次 look 后自动 draw  
- 替换用户上传图为角色图  

---

## 8. 配置

| 键 | 默认 | 说明 |
|----|------|------|
| `chatHeroLookEnabled` | `true` | 总开关 |
| `chatGameSelfHeroId` | `101003` | look self（已有可复用） |
| `chatHeroLookMaxPerTurn` | `1` | 每轮 look 上限 |

---

## 9. 验收

1. 「寒悠悠长什么样」→ 出现 look →【工具结果】有 desc → 文字回答，**不**自动出图。  
2. 「画一张你」→ look(self) → draw use_ref → 改图 job 的 sources 含本地寒悠悠图。  
3. 无本地图角色 → ok:false，不崩。  
4. 用户本条带普通图 + draw use_ref → 仍优先用户图。  
5. 工具结果 JSON 中无绝对路径 / base64。  
6. look 与 lookup 同轮：二段式后 strip 工具气泡，再处理 draw。

---

## 10. 已锁定决策

1. **读图**：Node `getHeroImgs` 为唯一真相；Python 只消费返回的 path（copy 到 media/looks）。  
2. **VLM 失败**：不阻塞 look；有图则 `ref_available=true` + 弱 desc。  
3. **`use_ref` + 用户图**：本条用户普通图优先；look ref 不抢。

---

## 11. 修订记录

| 版本 | 变更 |
|------|------|
| 初稿 | 解耦 look；desc+session ref；draw.use_ref；用户认可契约后落盘 |
| self-review | 锁定读图/VLM/用户图优先；look 与 lookup 分计上限与执行序 |
