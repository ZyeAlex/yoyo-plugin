# 时间看群 P0.5：驻留与空手退避

日期：2026-10-28  
状态：**已采纳 · P0.5 已落地（选项 A）**  
基线：P0（`2026-10-28-time-glance-heat-design.md`，已落地）  
性质：增量修改

---

## 拍板（评估修订）

| 项 | 决定 |
|----|------|
| `@` 反应延迟 | **选项 A**：硬触发仍直进人设；**保留** `earliest_speak_at U(2,8)` |
| probing | 不做（P2） |
| dwell 到期遇 busy | **延迟退出** |
| `empty_streak` | **硬封顶 5**（退避表下标 max 4） |
| 跨群 | **per-group**（现有 heat.json） |
| 冷跳过间隔 | 显式 **`last_interval`** |
| silent 与退出扣分 | **只在退出空手时 −0.08**；dwell 内 silent 不降 attention |
| 自己开口 | `had_interaction_this_dwell=True`，并 **续 dwell**（`max(dwell_until, now+60)` 或再抽 duration） |
| 冷跳过谓词 | **保持 P0**（完全无人超过 `last_interval`）；不加 attention&lt;0.15 收紧 |

---

## 一句话

P0：「多久看一次」。P0.5：「看的时候待在群里」+「空手后先快后慢再试」。

---

## 新增字段（heat.json）

```
session: "away" | "dwelling"     # 默认 away
dwell_until: float               # away 时无效
empty_streak: int                # 0..5
had_interaction_this_dwell: bool
last_interval: float             # 上次排进场用的间隔（冷跳过 / 调试）
```

P0 字段全部保留；`next_glance_at` / `last_glance_at` **语义改为「进场节拍器」**。

---

## 语义变更

| 字段/行为 | P0 | P0.5 |
|-----------|----|------|
| `next_glance_at` | 下次看一眼 | 下次 **进入 dwelling** |
| 响应结束排期 | 每次响应结束排 | **仅退出 dwelling 时排**；dwell 内响应结束不碰 `next_glance_at` |
| `@` | attention↑ + earliest_speak | 同上，且 **away→立即进 dwelling** / dwelling→至少再待 60s |

---

## 纯函数

### `dwell_duration(attention)`

| attention | 默认 |
|-----------|------|
| >0.7 | U(60, 180) |
| >0.4 | U(30, 90) |
| else | U(10, 30) |

### `backoff(attention, empty_streak)`

- `empty_streak == 0` → `glance_interval(attention)`（P0 log-uniform）
- else → `base[min(streak-1,4)] * (1 - 0.5*attention) * U(0.8,1.2)`  
  base = `[90, 300, 900, 1800, 3600]`

---

## 状态机

```
away --(now>=next_glance_at, 过冷跳过)--> dwelling
dwelling --(now>=dwell_until 且 not busy)--> away + next=now+backoff(...)
@ / 硬触发：任意态立即在/延长 dwelling；保留 earliest_speak_at
```

### away → dwelling

1. 冷跳过（P0：`last_human` 早于 `last_interval`）→ 不进场，重排 `next_glance_at`，写 `last_interval`
2. 否则：`session=dwelling`，`dwell_until=now+dwell_duration`，`had_interaction=False`，`last_glance_at=now`
3. 消息路径若已在 dwelling：直接快判（不再等 `next_glance_at`）

### dwelling 内

- 新消息：快判/回复；线程命中 → `empty_streak=0`，`had_interaction=True`，attention+0.2
- 自己开口：`had_interaction=True`，续 `dwell_until`
- silent：**不** −0.08（退出空手再扣）
- 响应结束：**不**排 `next_glance_at`

### 退出 dwelling

```
if had_interaction: empty_streak = 0
else: empty_streak = min(5, empty_streak+1); attention -= 0.08
session = away
span = backoff(...); last_interval = span; next_glance_at = now + span
```

busy 时到期：不退出，busy 结束后再检查。

---

## 配置

| 键 | 默认 |
|----|------|
| `chatDwellHotSec` | `[60, 180]` |
| `chatDwellChatSec` | `[30, 90]` |
| `chatDwellIdleSec` | `[10, 30]` |
| `chatBackoffRetrySec` | `[90, 300, 900, 1800, 3600]` |
| `chatBackoffAttentionFactor` | `0.5` |

P0 glance 端点保留，仅 `empty_streak==0` 时用。

---

## 验收（追加）

1. 冷群阶梯：空 dwell → ~90s → 5m → 15m → … 封顶 ~1h  
2. 热聊 dwell 60～180s，期间消息实时处理  
3. 刚说完空手：退避受 attention 缩短约 45～90s  
4. away 时 @ 立即进 dwelling。~~首条仍 ≥ earliest_speak~~（**2026-10-28**：被 @ 不再加反应延迟；开口间隔看 `last_decide_at` + `chatSpeakMinGapSec` 左端）  
5. dwell 内有互动 → 退出 empty_streak=0，走 glance_interval  
6. partner 跟别人聊不加 had_interaction  
7. busy 时 dwell 到期延迟退出  
8. 冷跳过仍生效  
9. dwell 内连回两句，`next_glance_at` 不变  

---

## 不做

probing；砍 earliest_speak；availability 时段；气泡间隔；真分布拟合。

---

## 修订记录

| 版本 | 变更 |
|------|------|
| P0.5 草案 | dwelling / backoff / 进场节拍器 |
| **采纳修订** | 选项 A；扣分不双计；开口续 dwell；`last_interval`；empty_streak≤5 |
