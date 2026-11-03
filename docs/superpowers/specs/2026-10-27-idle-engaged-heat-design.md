# idle / engaged 温度调度重设计

日期：2026-10-27  
状态：**已被取代**（多人 focus → 见 [addressivity-observe](./2026-10-27-addressivity-observe-design.md)）  
范围：`server/src/chat/temperature.py`、`mainline.py`、`prompts/persona.md`  
速查：[09-group-heat-transcript.md](../../09-group-heat-transcript.md)  
前序：[2026-10-27-group-heat-transcript-design.md](./2026-10-27-group-heat-transcript-design.md)（群记录 / 出站仍有效）

> **注意**：本文的「`focus_user_ids`≤3 句句必回」已废弃。现行为唯一 `partner_id` + `observe` 短窗，以 addressivity 规格为准。

## 1. 问题

旧「冷热 + warm_left 按群消息扣次」导致：

1. 用户 `@悠悠` 问完后继续说（不带 @），容易掉回攒批，看起来像「温度不够不回」
2. 要用多次 @ 才能再开口
3. 用单一群温度表示「用户愿不愿意聊」在多人 QQ 群不成立

对照麦麦：@ 强制进入决策；活跃段防抖后直接规划；`talk_value` 只管闲置频率；连续 no_reply 才 backoff——**不把跟聊再套一层攒批门闩**。

## 2. 目标形态

```text
idle（闲置）              engaged（跟聊中）
  攒批 + 快模型     ←→      短防抖 → 直接人设
  偶尔插话                  可空 replies；engagement 退场
```

否决：用一个群标量温度 =「用户意愿」。  
采用：`mode` + `focus_user_ids` + 闲置专用 `temperature`。

## 3. 状态（`heat.json`）

| 字段 | 含义 |
|------|------|
| `mode` | `idle` \| `engaged` |
| `temperature` | **仅 idle** 攒批频率；`batch_need = clamp(ceil(1/t), 1..10)` |
| `unread` | idle 未读条数 |
| `engaged_until` | 跟聊截止时间戳（**按时间**，默认约 180s） |
| `focus_user_ids` | 最近跟聊用户 QQ，最多 3 |
| `silent_streak` / `backoff_until` | idle 快模型连续 silent 退避 |

## 4. 决策表（`on_incoming`）

| 条件 | 返回 | 上层行为 |
|------|------|----------|
| 硬触发（@/唤醒/回她/点名） | `reply` | 立刻人设；`enter_engaged` + focus |
| engaged 且 user ∈ focus | `hold` / `persona` | 防抖后**直接人设**（不跑快模型） |
| engaged 且非 focus | `bystander` | skip `engaged_bystander`；不耗窗、不叫模型 |
| engaged 超时 | 转 idle 后再走攒批 | 不强制改温度 |
| idle 未攒满 | `batch` | `idle_batch` |
| idle 攒满 | `judge` | 快模型 `reply\|silent\|leave` |

## 5. 人设输出

```json
{"engagement":"hold","replies":[{"type":"text","text":"..."}]}
```

| engagement | 效果 |
|------------|------|
| `up` | 留在 engaged，刷新满窗；idle 温度略升 |
| `hold` | 留在 engaged，刷新满窗 |
| `down` | **仍 engaged**，缩短剩余时间（约 30～90s）；禁止再砍成「只能再判 N 次」 |
| `leave` | idle + t=0.1 + 清空 focus |

| replies | 效果 |
|---------|------|
| 非空 | 正常发气泡 |
| `[]` | `empty_reply`：群里不说话，仍应用 engagement |

system 注入【跟聊焦点】提示 focus QQ 与当前发送者。

## 6. 与旧方案差异（刻意）

- 跟聊期**不再**快模型门闩  
- **不再**用群消息条数消耗跟聊额度  
- `down` 不踢出 engaged  
- 路人消息不抢走 focus 线程  
- 空回复合法（替代「热态再 silent 一次」）

## 7. 代码与测试

| 路径 | 职责 |
|------|------|
| `server/src/chat/temperature.py` | idle/engaged、focus、engagement |
| `server/src/chat/mainline.py` | `_choose_action`、防抖→人设、空回、focus 注入 |
| `server/prompts/persona.md` | engagement + 空 replies |
| `tests/test_heat_transcript.py` | 单测 + @ 后跟聊 |
| `tests/test_heat_scenarios.py` | 多角色场景智能回归 |

配置：`chatHeatEnabled`、`chatHeatDebounceSec` / `CHAT_HEAT_DEBOUNCE_SEC`、`chatHeatEngagedSec` / `CHAT_HEAT_ENGAGED_SEC`。

## 8. 迁移与故障：旧 warm 无 focus

**症状**：能 `@/点名` 回复，接着不带 @ 的跟句完全不理。  

**原因**：升级前 `heat.json` 可能是  

```json
{"mode":"warm","warm_until":…,"warm_left":0,"focus_user_ids":[]}
```

读入后若当成 engaged 且 focus 为空，非硬触发一律 `bystander`。叠加旧 `silent_streak` + 超长 `backoff_until` 会进一步卡死 idle 攒批。

**处理**：

| 层 | 行为 |
|----|------|
| `load_heat` | 无 focus 的 engaged/warm → idle；`backoff_until > now+180` 清零 |
| `_ensure_heat` | 内存态同样 demote，避免只改磁盘不生效 |
| 硬触发 | 清退避计数 |
| 人工 | 重置 `data/memory/group/{id}/heat.json` + 重启 server |

回归：`test_engaged_without_focus_demotes_to_idle`。

## 9. 非目标

- 每人独立温度曲线（focus 列表足够）  
- 热态再套快模型  
- 向量预筛（可后续加在 idle judge 前）
