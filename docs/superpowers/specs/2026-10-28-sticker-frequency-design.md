# 表情包发送频率：货架按需注入（工具面对齐）

日期：2026-10-28  
状态：**已实现**（货架门闩 + 人设精简）  
范围：何时注入【可发表情】；不改入库 / resolve 策略 B  
前置：[`2026-10-27-sticker-shelf-awareness-design.md`](./2026-10-27-sticker-shelf-awareness-design.md)  
速查：[`../../10-capabilities-and-stickers.md`](../../10-capabilities-and-stickers.md)

---

## 1. 现象与病因（已核实）

现象：群里人设几乎「一句话带一张表情包」。

**不是**出站偷偷塞图。`resolve_sticker_bubbles` 只按模型写出的 sticker id 发图。

三条叠在一起：

1. **每轮开口都注入【可发表情】** → 表情能力像常驻工具栏。
2. **历史自模仿**：transcript 里「一句字 → 一行表情包」。
3. **人设用软概率（20% / 0%～30% / 斗图才发）压不住** —— `608161397` 上新文案进 prompt 后仍 4/5 非斗图配图。

结论：模型**有选择能力**（会正确写 `type:sticker` + id），缺口是 **工具面未对齐**——货架每轮可见，等于每轮都把 sticker 工具挂上；再堆规则无效。

代码里早已有 `wants_dou_tu()`，但 `build_sticker_shelf` 未使用（接线缺口）。

---

## 2. 别家对照（摘要）

| 参考 | 要点 |
|------|------|
| MaiBot | `emoji_chance` 先决定表情动作是否进候选池；多数轮次模型根本看不到 |
| AstrBot | 出站再按频率抽签 |
| dsh | 场景语言；忌硬配额写进 prompt |
| 独立分类器 | 正文后另判；成本高 |

共识：发不发不要只靠「每轮满货架 + 软提示」。

---

## 3. 选定方案：货架按需出现（对齐工具调用）

与画画一致：**本轮没有能力面就不该写对应 JSON**。

| 条件 | 行为 |
|------|------|
| `wants_dou_tu`（当前句表情 /「斗图」「发个表情」等） | **必开**货架 |
| 非斗图 | `random() < chatStickerShelfChance`（默认 **0.25**）才开 |
| 未打开 | 不注入【可发表情】；模型无 id 可用；resolve 仍丢无效 sticker，**字照发** |

人设减规则（已改 `persona.md`）：

> 本轮出现【可发表情】时才可写 sticker；没有货架就只打字。

不做：出站成功后再删图；漏选自动塞图；mood 枚举字段（除非门闩仍不够）。

---

## 4. 落地

| 项 | 位置 |
|----|------|
| 门闩 | `mainline.build_sticker_shelf(..., rng=)`；先 `wants_dou_tu`，否则掷 `chat_sticker_shelf_chance` |
| 配置 | `chatStickerShelfChance`（default/config.yaml、Settings、面板 schema） |
| 人设 | `server/prompts/persona.md` 短句 |
| 货架脚注 | `format_shelf_prompt`：标明「本轮可选」，不用就只回文字 |
| 测试 | `tests/test_sticker_reply.py` 门闩 + chance=0 |

改完需 `#重启悠悠`。

---

## 5. 提示词试验结论（归档）

曾试「情绪饱满 / 约 20%」「斗图才发 + 0%～30%」——货架仍每轮注入时，在 `608161397` **几乎无效**。保留本结论以免再走回头路。

---

## 6. 若仍偏多

1. 把 `chatStickerShelfChance` 降到 `0`～`0.1`（仅斗图 / 极少偶发）。
2. 出站冷却（近 N 条已发过则丢 sticker）——次选。
3. 历史回写格式减弱「一句一图」模板——可选。

---

## 7. 相关路径

| 路径 | 角色 |
|------|------|
| `server/src/chat/mainline.py` | `wants_dou_tu` / `build_sticker_shelf` / `format_shelf_prompt` |
| `server/prompts/persona.md` | 短规则 |
| `config/default.yaml` · `chatStickerShelfChance` | 非斗图注入概率 |
| `server/tests/test_sticker_reply.py` | 门闩单测 |
