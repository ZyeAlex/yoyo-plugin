# 群记录、出站 @、对话主体 / 观察态

> **现行温度规格**：[2026-10-27-addressivity-observe-design.md](./superpowers/specs/2026-10-27-addressivity-observe-design.md)  
> **时间瞥视 / dwelling**：[2026-10-28-time-glance-heat-design.md](./superpowers/specs/2026-10-28-time-glance-heat-design.md)  
> 前序（多人 focus，已部分取代）：[2026-10-27-idle-engaged-heat-design.md](./superpowers/specs/2026-10-27-idle-engaged-heat-design.md)  
> 群记录前序：[2026-10-27-group-heat-transcript-design.md](./superpowers/specs/2026-10-27-group-heat-transcript-design.md)  
> 主线：[07-chat-brain-mainline.md](./07-chat-brain-mainline.md)  
> 记忆层：[08-chat-brain-memory-layer.md](./08-chat-brain-memory-layer.md)  
> 能力注入：[10-capabilities-and-stickers.md](./10-capabilities-and-stickers.md)  
> 游戏知识：[12-game-knowledge.md](./12-game-knowledge.md)

对照麦麦心流和 DSH 的群聊做法，跑在现有 Chat Brain 里，不接它们的运行时。

## 1. 为什么改

`session.jsonl` 只在悠悠回复成功后写。没点到她的句子一重启就丢；`raw_message` 里的 CQ 也曾污染模型输出。

主动开口曾靠短问正则；后又用「冷热 + 群消息扣 warm_left」，导致 **@ 之后跟聊不 @ 就不回**，要连 @ 好几次。  
再后「多人 `focus_user_ids` 句句必回」又导致两人先后 `@` 后**两头接**；人设还爱喊昵称、长句带「。」。

**现行结论（2026-10-28）**：

1. 去掉问句/闭嘴等启发正则  
2. **idle / engaged / observe**：唯一 `partner_id` 短窗续聊；非主体或人↔人互聊 → 观察  
3. 温度 **只服务闲置/观察攒批频率**，不表示「用户意愿」  
4. **双模型分工（2026-10-29 修订）**：**away（冷/温）进场**仍用快模型厚判「要不要接话」；**已在 dwelling（热）**跳过快判，直接进人设——由悠悠决定接不接（可空 `replies` 旁听）。硬触发始终直进人设。人设侧按热度**只注入一份**提示：`prompts/heat/{cold,warm,hot}.md`（`resolve_heat_mode` → `load_heat_prompt`），不在 `persona.md` 里堆三态。  
5. 主动插嘴 `heat_reply` 不进 engaged；`note_chime` 温度封顶 0.25；有人接再小步升温  
6. 人设：少喊昵称、少「。」、短句、两意两泡；`engagement` + 可空 `replies`  
7. 出站 `mention` 仅纯数字 QQ；画图 `awaiting_outbox` + skip 顺带 drain 防丢图  
8. 表情：货架按需注入（斗图必开 / 平时概率）；有货架才给人设选；不删文字、不强制配图。见 [10 §2.1](./10-capabilities-and-stickers.md)

## 2. 群记录（每条都进缓存）

`server/src/chat/transcript.py`

- 路径：`server/data/memory/group/{id}/transcript.jsonl`（运行数据，不进 Git）
- **`handle` 一进来就记**，含纯图片/表情；是否开口之前已落盘
- 一行：`{ts, line}`，例如 `塔菲: 悠悠评价一下@夜夜 [图片]`。塞给人设的【近期群聊】把 `ts` 显示成北京时间 `[10-28 17:32]`，并在开头写 `【现在】`
- 回复成功再记 `悠悠: ...`
- 滚动约 400 行；人设对话附带近约 **30 行** + `recent` 环 +「当前消息」

`session.jsonl` 只给长期抽取，不代替短期对白。

## 3. 出站

`sanitize_outgoing`：正文 `[CQ:at,qq=]` → `mention`；其它 CQ 删除。**`mention` 必须是 5–14 位纯数字 QQ**；昵称若能从本条/recent/焦点映射到 QQ 则纠正，否则丢掉（防 @空气/@错人）。插件 `segment.at` 同样只接受数字 QQ。人设禁止输出 CQ、禁止把昵称写进 `mention`。

### 画图出站（曾踩坑）

工具完成后要 LLM 收尾再 `push_outbox`。旧逻辑一标 `done` 就清空 `busy`，插件轮询见空闲就停 → **图卡在 outbox**，只有再说「悠悠」走 reply 才会顺带走。现行：`awaiting_outbox` 占住 busy；skip 也顺带 drain outbox；`tool_done` 后给发起人续 engaged。

## 4. idle / engaged / observe（现行）

规格：[addressivity-observe-design](superpowers/specs/2026-10-27-addressivity-observe-design.md)。  
`server/src/chat/temperature.py` → `heat.json`。

### 4.1 温度只用于 idle / observe 攒批

| t | 大约几条才快模型看一眼 |
|---|------------------------|
| 0.1 | 10 |
| 0.25 | 4 |
| 0.5 | 2 |
| 1 | 1 |

`batch_need = clamp(ceil(1/t), 1..10)`。

### 4.2 三态 + 单一主体

| 态 | 谁决定说不说 |
|----|--------------|
| **idle** | 攒批 → 快模型判「要不要接话」。多数 silent；通过后才进人设。最低温度 0.1 = 10 条看一次 |
| **engaged** / **dwelling** | 热态：路人软消息**直进人设**（不经快判）；硬触发仍立刻开口 |
| **observe** | 旁听；非硬触发不句句接，只走攒批插话 |

**进入 engaged**：硬触发（@、点名、回复她）。温度抬到约 0.45。  
**非 partner 发言（热窗内）**：`engaged_batch` / `engaged_judge` → 快判可插嘴；`note_engaged_glance` 保持 partner。两次开口约 ≥12s，窗内最多约 8 条。  
**冷群主动插嘴** `heat_reply`：不进 engaged；`note_chime`。  
**指向他人**（非短窗；@别人且未提悠悠）→ observe。  
engaged 超时 → observe → 再超时 → idle。

### 4.3 主动插嘴

冷的时候不是「只有被 @ 才说话」。温度最低（0.1）时大约 **10 条看一次**；看的时候可以因为感兴趣接一句，哪怕话题没提到她。

| 步骤 | 行为 |
|------|------|
| 攒批 | `batch_need = clamp(ceil(1/t), 1, 10)`。t=0.1 → 10 条；t=0.25 → 4 条 |
| 快模型（厚） | 只判「要不要接话」：`reply` / `silent` / `leave`。多数 silent；开放话题、能接的点可以 reply，不必提到悠悠。两人互相@的封闭局不要插。**不**写正文，**不**判聊得热不热 |
| 人设（薄） | 仅当 `reply` 后进入。写短回复 + `engagement`（跟当前聊天的意愿）。开口前**不** `_mark_heat_spoken` |
| 说出口 | `note_chime`：不进 engaged、不锁 partner；温度封顶 **0.25**；写下 `chime_at` |
| `silent` / 空回 | `mark_silent`，温度朝 0.1 降。连续两次 silent 进入 backoff（15 秒起，封顶 120 秒；未读≥6 可打断） |
| 有人注意 | 约 180 秒内被 @/点名/回复，或短窗 `up`/`hold`：温度 `smooth(t, 0.35)` 小步升温 |

硬触发仍立刻进人设并 engaged。**away 进场**仍走快判门闩；**已在 dwelling** 的软消息直进人设（见 §4.2）。

代码：`mainline._judge`（仅 away 进场）；`temperature.note_chime` / `mark_silent`；`_apply_heat_engagement(reason="heat_reply", spoke=…)`。

### 4.3.1 快判「克制」语义（2026-10-28）

踩坑：提示写「悠悠刚说过话则更要克制」→ 快模型理解成**刚说过就 silent**，dwell 未结束、对方无 @ 追问也被旁听掉。

**2026-10-29**：已在 `dwelling` 时**不再跑快判**，软消息直进人设（空 replies = 旁听）。快判提示仍只用于 **away 进场**；克制语义改由人设 system「看群状态」承担。

### 4.4 连发接话（打断 + 防抖）与节奏

开口统一进 `speak_buffer`，**不**再对每句立刻跑人设：

| 时机 | 行为 |
|------|------|
| 上一轮人设还在 `thinking` | 打断当前推理（**不**取消画画等工具 job），新句进 buffer，重置防抖 |
| 上一轮已结束 / 刚发完 | 新句（含 `@`）同样进 buffer，安静 `chatHeatDebounceSec`（默认 1.5s）后再开一轮 |
| 距上次决定开口太近 | 防抖后再等到 `chatSpeakMinGapSec` 左端（默认 3 秒）才进人设；不够就等，不丢这轮 |
| 工具 `tool_running` | 主动找她 → `ack_busy` + pending；旁听只记账。与原先约定一致 |

多句在一轮里一起看（transcript 已逐条落盘；当前消息可拼多行）。插件对 `reason=hold` 轮询 outbox 再延时分气泡发送。

**节奏靠热度间隔 + 防抖 + 两次决定开口的底线。** 底线取 `chatSpeakMinGapSec` 左端，从上一次决定进人设的时刻算；隔得够久就只剩防抖。被 `@` 不再额外愣 `chatAtReactionSec`。  
快判已经 `reply` 的轮次**只等、不丢**（不再 `skip/speak_gap`）。

### 4.5 engagement + 口吻

人设在**已经决定要开口**之后，才用 `engagement` 表达跟当前聊天的意愿（不要再判「该不该出现在群里」）：

| engagement | 效果 |
|------------|------|
| `up` / `hold` | 仅 partner 刷新短窗 |
| `down` | → observe |
| `leave` | idle + 清 partner / `chime_at` |

人设：少喊昵称、少「。」、短句、两意两泡。system 注入【对话主体】。`server/prompts/persona.md`。

### 4.6 仍跳过

- `help.yaml` 派生游戏指令 → `game_command`  
- `chatHeatEnabled: false` 且未硬触发 → `no_trigger`  

### 4.7 运维：脏 heat.json

无 `partner_id`（且无 focus 可迁）的 engaged → idle；异常超长 `backoff_until` 清零。应急：重置 `heat.json` + `#重启悠悠`。

## 5. 配置

| 键 | 默认 | 说明 |
|----|------|------|
| `chatHeatEnabled` | true | 开温度调度 |
| `chatHeatDebounceSec` | 1.5 | 开口防抖（含硬触发攒句） |
| `chatHeatEngagedSec` | 45 | 跟聊短窗秒数（配置可更高） |
| `chatHeatObserveSec` | 90 | 观察窗秒数 |
| `chatAtReactionSec` | `[2, 8]` | 保留配置位，不再推迟开口 |
| `chatSpeakMinGapSec` | `[3, 5]` | 两次决定开口的最短间隔，取左端（默认 3 秒）；右端不参与等待 |
| `chatMaxReplies` | 2 | 最多气泡（两意两泡） |

## 6. 代码

| 文件 | 职责 |
|------|------|
| `transcript.py` | 群记录 |
| `outbound.py` | 出站 CQ |
| `temperature.py` | idle/engaged/observe、partner、engagement |
| `should_respond.py` | 关热度时硬触发；`is_game_command` |
| `help_capabilities.py` | help → 能力 + 指令 skip |
| `mainline.py` | 决策、防抖→人设、空回、主体注入 |
| `prompts/persona.md` | 短句口吻 + engagement |
| `apps/chat.js` | `hold` / tool 时拉 pending |

测试：`test_heat_transcript.py`、`test_heat_scenarios.py`。

## 7. 开发追踪（临时）

决策过程写在 `trace.jsonl`。调试结束后整段删除，清单：[11-debug-trace-remove.md](./11-debug-trace-remove.md)。  
群对白仍是 `transcript.jsonl`，不要和追踪日志一起删。

## 8. 还没做

- idle 快模型前的零 token 向量预筛  
- 每人独立温度曲线（刻意不做；现行是单一 partner）
