# 时间看群：模拟刷 QQ（连续注意力）

日期：2026-10-28  
状态：**已采纳 · P0 已落地**（增量见 `2026-10-28-dwell-backoff-heat-design.md` P0.5）  
取代：条数攒批；三档硬切；现行 `unread` / `engaged_batch`

---

## 评估与二次修订

裁剪版自评约 7.8；外部评估裁剪决策 **8/10**，方向通过。二次修订：

| 项 | 决定 |
|----|------|
| @ 的 `reaction_delay` | **升入 P0**：`earliest_speak_at = now + U(2,8)`，仅硬触发路径 |
| 对数均匀措辞 | 有限区间截断，验收写「偶发接近上界」，不写「偶尔 1～2 小时」 |
| 冷跳过 | **完全无人说话**超过本次间隔 → 跳过；有人说过但无关 → 可快判 |
| `last_speak_at` | 取**本轮最后一条**发出时刻，轮次底线从此计 |
| `pending_at` | P0 布尔，单群合并连 @；跨人信息丢失可接受 |
| `partner_id` | **P0 只写入不读取**（P1 预留） |
| floor 重置 | 每次开口重置 8 分钟窗口，**有意为之** |
| DSH | 不纳；注明「若未来引入心跳层，需重定写权限」 |

---

## P0 行为

### attention → 看群间隔（对数均匀）

响应结束（人设出站完 / tool_done 收尾完）后，按 `attention` 在三段端点间插值，段内 **log-uniform** 采样 → `next_glance_at`。

| attention | 端点默认 |
|-----------|----------|
| ≈0 | `[1500, 3600]` 秒 |
| ≈0.5 | `[20, 40]` |
| ≈1 | `[3, 8]` |

busy（thinking / tool / awaiting_outbox）不并行开第二轮人设。

### 冷跳过

闲逛（attention 低）且 **`last_human_at == 0` 或距今 ≥ 本次抽到的间隔**（群在整个间隔内完全无人说话）→ 不调模型，只重排下一次。  
若间隔内有人说过话（哪怕无关）→ 允许快判（常 silent，略降 attention）。

### attention / floor

| 事件 | 效果 |
|------|------|
| 衰减 | 每分钟 ×0.92，但 ≥ floor；松 floor 后从当前值继续衰减，**不清零** |
| 自己开口 | attention≥0.5；floor=0.32，`floor_until=now+480`（每次开口重置，有意） |
| 线程命中理我 | +0.2（仅 reply_to_bot / at_bot / 引用 bot） |
| 硬触发 | attention=0.95；`pending_at=true`；floor=0.9；写 `partner_id`（P0 不读） |
| silent 且未理我 | −0.08 |

### @ 反应钩子（P0）

硬触发进入表达前：

```
earliest_speak_at = now + uniform(2, 8)
```

开口前必须 `now >= earliest_speak_at`（可与防抖叠加；睡觉等待）。  
普通主动插话不强制此钩子，靠轮次底线。

### 轮次开口底线

两次**表达轮次**之间 U(3,5)s；计时起点 = 上一轮**最后一条**发出的 `last_speak_at`。  
到期可看但未满底线 → 只看不说。

### 线程「有人理我」

仅：`hints.reply_to_bot` / `hints.at_bot` / 消息引用 bot。  
**不用** partner 继续说话。

---

## 状态字段

```
attention, attention_floor, floor_until
next_glance_at, last_glance_at, last_speak_at, last_human_at
partner_id          # P0 只写不读
pending_at          # bool
earliest_speak_at   # @ 钩子
```

遗留 `temperature`/`unread`/`mode` 可读可写，**不驱动决策**。

---

## 配置默认

| 键 | 默认 |
|----|------|
| `chatGlanceIdleSec` | `[1500, 3600]` |
| `chatGlanceChatSec` | `[20, 40]` |
| `chatGlanceFocusSec` | `[3, 8]` |
| `chatSpeakMinGapSec` | `[3, 5]` |
| `chatAtReactionSec` | `[2, 8]` |
| `chatGlanceRecentLines` | `30` |
| `chatUnansweredGiveUpSec` | `480` |
| `chatAttentionDecayPerMin` | `0.92` |

---

## 验收

1. 完全无人说话超过间隔 → 跳过无快判  
2. 间隔内有人说过话 → 可快判（即使无关）  
3. 说完后约 20～40s 级再看；8 分钟松 floor 后从 ~0.32 **继续衰减**不清零  
4. 每次开口重置 floor 窗口（持续表达期间 floor 活跃）  
5. ~~@ 后首条发送距「决定开口」≥2s（`earliest_speak_at`）~~（**2026-10-28 修订**：被 @ 不再加这段愣住。两次决定进人设的间隔不短于 `chatSpeakMinGapSec` 左端，不够就等，不丢句）  
6. ~~两次轮次开口 ≥3s 硬闸~~（**2026-10-28**：不再 `skip/speak_gap` 丢掉；间隔改由 `last_decide_at` 在进人设前等待补齐）  
7. partner 跟别人聊不加 attention；@/回/引用才加  
8. 闲逛偶发接近上界（约 50～60 分钟），不承诺 1～2 小时  
9. 画画：确认结束排期；画完收尾再排期  

---

## 缓纳 / 不纳

- **P1**：availability 真规则、普通接话 reaction_delay、气泡级间隔、真分布拟合  
- **不纳**：dsh-heartbeat（仓内无）；**若未来引入心跳层，需重定「下一拍」写权限**

---

## 修订记录

| 版本 | 变更 |
|------|------|
| 裁剪采纳 | 对数均匀 + floor + 线程初筛 + 轮次底线 |
| 二次修订 | @ earliest_speak_at；六条边界；验收补强 |
| 2026-10-28 | dwell 快判后取消 `speak_gap` 硬吞；快判「克制」改为轮次判断（见 `09` §4.3.1） |
