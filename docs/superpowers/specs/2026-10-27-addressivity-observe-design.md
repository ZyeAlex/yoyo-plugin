# 对话主体 + 观察态（addressivity）

日期：2026-10-27  
状态：**已实现**  
取代：[2026-10-27-idle-engaged-heat-design.md](./2026-10-27-idle-engaged-heat-design.md) 中「多人 focus 句句必回」部分  
速查：[09-group-heat-transcript.md](../../09-group-heat-transcript.md)

## 1. 问题

旧 `focus_user_ids`（≤3）在 ~180s 内对名单内**每人每句**进人设。两人先后 `@` 后变成两头接；人设还鼓励喊昵称、长句带「。」，不像 QQ 群友。

## 2. 目标

- **单一对话主体** `partner_id`：短窗续聊（默认 ~45s）
- **观察态** `observe`：人↔人互聊或窗过期后旁听，只走 idle 攒批插话，不句句接
- **口吻**：少喊名、少句号、短句、两意两泡

## 3. 状态（`heat.json`）

| 字段 | 含义 |
|------|------|
| `mode` | `idle` \| `engaged` \| `observe` |
| `partner_id` | 唯一对话主体 QQ |
| `engaged_until` | 短窗截止 |
| `observe_until` | 观察窗截止 |
| `temperature` | 仅 idle / observe 攒批。夹在 0.1–1；0.1 = 10 条看一次 |
| `chime_at` | 最近一次主动插嘴的时间戳。0 表示没有。约 180 秒内有人接话才小步升温 |
| `focus_user_ids` | 兼容字段：读写时与 `partner_id` 同步为至多一人 |

## 4. 决策

| 条件 | 行为 |
|------|------|
| 硬触发 | 人设；`partner_id=发送者`；`engaged` 短窗。若刚插过嘴（`chime_at` 约 180 秒内），温度只 `smooth` 向 0.35，不抬到热聊 |
| engaged ∧ 发送者==partner | 防抖 → 人设（可空回） |
| engaged ∧ 发送者≠partner | **热窗看全群**：加快攒批 → 快判插嘴；冷却 ≥12s、窗内最多约 8 条；**不拆短窗** |
| 指向他人（非短窗；@别人且话里未提悠悠） | → observe，再走攒批；短窗内 partner @别人仍续聊 |
| engaged 超时 | → observe |
| observe 超时 | → idle |
| observe / idle 非硬触发 | 攒批 → 快模型判接话 → 通过才进人设。插嘴后保持冷，有人接再慢慢升温 |

互聊：最近约 4 条发言者中 ≥2 个非 bot 用户交替 → `observe`。

## 5. 双模型分工（2026-10-28 确认保留）

| 层 | 职责 | 输出 |
|----|------|------|
| 温度攒批 | 多久看一眼 | `batch` / `judge` |
| 快模型（厚） | **要不要接话**。开放话题 / 提到悠悠偏 reply；明显私聊才 silent；不写正文 | `reply` / `silent` / `leave` |
| 人设（薄） | **跟当前聊天的意愿** + 短回复正文。系统已决定开口后才进 | `engagement` + `replies` |

曾试过删掉快模型、攒满直接人设；产品结论是改回门闩。**后续只放宽 `_judge` 提示词，不要再删这层。**

## 6. engagement

| 值 | 效果 |
|----|------|
| `up` / `hold` | 仅当发送者仍是 partner 时刷新短窗。插嘴窗口内目标温度是 0.35，不是 0.55/1 |
| `down` | → observe |
| `leave` | → idle，清空 partner 和 `chime_at` |
| （插嘴） | `heat_reply` 不走这张表进 engaged。`note_chime`：保持 idle/observe，清 partner，温度封顶 0.25，写下 `chime_at`。快模型 `leave` → `mark_leave`；人设空回 → `mark_silent` |

## 7. 口吻（persona）

第二人称少喊昵称；少用「。」；单泡 ≤20 字目标；默认 1 泡，两意两泡；`chatMaxReplies`≤2。

## 8. 配置

| 键 | 默认 |
|----|------|
| `chatHeatEngagedSec` | 45 |
| `chatHeatObserveSec` | 90 |
| `chatMaxReplies` | 2 |
