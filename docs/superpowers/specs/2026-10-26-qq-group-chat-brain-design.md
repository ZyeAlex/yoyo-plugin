# QQ 群聊 Chat Brain 设计

日期：2026-10-26  
状态：MVP-1 实现中  
范围：yoyo-plugin 插件适配层 + yoyo-sauce（`server/`）群聊大脑

## 1. 目标与非目标

### 目标

打造**专为 QQ 群聊定制**的聊天产品：像群友一样说话，同群一条主线记账，支持异步工具（如画画）完成后再回到主线统一收尾。

部署形态与旧悠悠一致：

- 仓库：`https://gitee.com/yoyo-plugin/yoyo-sauce.git` → 本地 `plugins/yoyo-plugin/server/`
- 插件指令：`#安装悠悠` / `#卸载悠悠` / `#启动悠悠` / `#停止悠悠` / `#重启悠悠`

### 非目标（本阶段）

- 不接入 DeepSeek Harness（DSH）整栈
- 不做旧版 Harness：ReAct 渐进工具目录、游戏查库工具链、Skills 写作循环等
- 不使用 SnowLuma（QQ 由 Yunzai 负责）
- 游戏图鉴 / 签到等仍走现有命令插件，不与聊天混成工具调用
- 第一版不做「无人点名也高频插话」的完整二代仿真；主路径是每条消息判定 + 主线串行

### 成功标准

1. 白名单群内每条消息都经 `should_respond`；多数 skip 不调主模型
2. 同群只有一条主线；多用户插话与 tool 完成共享同一时间轴
3. `thinking` 可打断 LLM；`tool_running` 不杀 job，插话可 `ack_busy`
4. tool 完成不直接私发支线结果，必须回注主线后再开口（如先对 A 交画，再招呼 B）
5. `#安装悠悠` 可拉起 server；LLM Key 可配

## 2. 总架构与职责边界

```text
QQ 群
  │
  ▼
Yunzai + yoyo-plugin                 ← QQ 适配层
  · 白名单 / 每条消息上报 / 缓冲
  · 发送多气泡（含打断代次校验）
  · #安装悠悠 → clone yoyo-sauce → server/
  · 启停进程、配置面板「聊天」分组
  ▼
POST /api/chat  （及 tool 完成等内部回注）
  ▼
server/（yoyo-sauce）Chat Brain      ← 产品内核
  · 同群单主线 Event Queue
  · should_respond
  · 人设 + timeline + 会话上下文
  · 主模型（DeepSeek / OpenAI 兼容）
  · 可选异步 tool jobs（完成 → 回注主线）
```

| 层 | 做什么 | 不做什么 |
|----|--------|----------|
| 插件 | 装服、启停、门控、缓冲、组请求、发气泡、面板 | 不调 LLM、不做人设推理、不跑工具 |
| server | 主线队列、判定、上下文、模型、工具 job、编排回复 | 不直连 QQ |
| 游戏命令 | `#图鉴` 等保持原样 | 不经 Chat Brain 工具调用 |

对照流行栈（仅映射职责，不复用其运行时）：

```text
他们：QQ NT → SnowLuma → qq-bridge → DSH
你们：QQ    → Yunzai    → yoyo-plugin → yoyo-sauce（Chat Brain）
```

## 3. 同群单主线（Event Mainline）

### 原则

- 每个群（`session_id = group:{gid}:bot:{bid}`）**唯一**主线时间轴
- 用户消息、bot 已发气泡、`tool_started` / `tool_done`、系统提示均为事件
- **禁止**为工具或插话另开独立聊天 session（避免画画会话与新会话不同步）
- 对群开口**只有一个出口**：主线编排器（串行）

### 结构

```text
GroupMainline
  timeline[]     已发生事件（有上限截断）
  queue[]        待消化事件（FIFO）
  jobs[]         进行中工具 { id, name, status, started_at, result? }
  phase          idle | thinking | tool_running
  turn_gen       单调代次；过期回复丢弃
  persona / group_atmosphere
```

### 目标体验（规范例）

1. A：帮我画画 → 主线接受 → 可短应答 → 启动 `draw` job（挂主下，非新会话）
2. B：你能帮我 xxx 吗 → 同一主线入队；job 仍在跑 → `ack_busy`：「别急，我正在画画」
3. `tool_done(draw)` → **入队**，不直接把图甩给 A
4. 主线续写（同一叙事）：先对 A「终于画好啦，给你」+ 图 → 再对 B「还在吗，忙完啦，要继续帮吗」

## 4. 触发与 should_respond

### 插件层

- 群号 ∈ 白名单（空 = 不监听）
- 服务在跑
- **白名单群内每一条消息** append 缓冲并请求 server（不仅 @）
- 默认不阻断其他插件（低优先级 / 适当 `return false`）
- 明显游戏指令前缀可由 server skip 或插件侧短路

### should_respond（server，第一版纯规则）

**必回**

- @ 机器人
- 唤醒词
- 引用/回复机器人消息

**可回（可配启发式）**

- 叫到 bot 昵称/人设名
- 短问句、明显接话
- 冷却与每群每分钟主动回复上限

**默认 skip**

- 群友互聊、长链接、机器人自身消息、可识别的图鉴/签到等命令

| 结果 | 主模型 | QQ |
|------|--------|-----|
| skip | 不调 | 沉默 |
| reply | 调 | 发气泡 |
| ack_busy | 短调用或模板 | 安抚气泡 |

## 5. 打断与阶段（不销会话）

打断 ≠ 终止会话；不清空 timeline / 跨轮史。仅影响当前对外生成。

| 当前 phase | 主动发起（@ / 唤醒 / 引用 bot） | 行为 |
|------------|--------------------------------|------|
| `thinking` | 是 | Abort 当前 LLM；`turn_gen++`；事件保留主线；以新队列状态重新编排 |
| `tool_running` | 是 | **不** cancel job；用户事件入队；`ack_busy`；job 完成后 `tool_done` 入队再主线续写 |
| 任意 | 否（普通旁白） | 入 timeline/queue；由 should_respond 决定是否开口；不 abort LLM |

主动发起定义与必回条件一致，避免普通群聊误打断。

发送保护：气泡携带 `request_id` + `turn_gen`；插件与 server 均忽略过期代次。

## 6. 上下文与人设

| 块 | 说明 |
|----|------|
| 人设 | `persona.md`（可群覆盖） |
| 群氛围 | 可选；首次或 reset 后注入一次 |
| timeline / recent | 近期群聊 + 主线事件摘要 |
| jobs 状态 | 进行中工具名与状态，供 ack / 续写 |
| 当前事件 | 本条 user 或 tool_done |

主模型：仅 reply / 主线续写 /（可选）ack_busy 短调用；OpenAI 兼容 API；输出 JSON 多气泡，短句、最多 K 条。

## 7. API 契约（插件 ↔ server）

### `POST /api/chat`

每条白名单消息可调用。示意：

```json
{
  "request_id": "...",
  "session": {
    "session_id": "group:{gid}:bot:{bid}",
    "group_id": "...",
    "bot_id": "..."
  },
  "message": { },
  "recent": [ ],
  "hints": {
    "at_bot": false,
    "wake_word": false,
    "reply_to_bot": false
  }
}
```

响应示意：

```json
{
  "code": 0,
  "data": {
    "action": "skip" | "reply" | "ack_busy",
    "reason": "at_bot" | "cooldown" | "tool_running" | "...",
    "turn_gen": 12,
    "busy": {
      "tools": [{ "id": "job_1", "name": "draw_image", "status": "running" }]
    },
    "replies": [
      { "type": "text", "text": "短句", "mention": "可选 user_id" },
      { "type": "image", "path": "..." }
    ]
  }
}
```

### 工具完成回注

server 内部或 `POST /api/internal/tool_done`（仅本机）：将结果写入对应 job，并 **enqueue `tool_done` 到主线**，由编排器决定如何说话。  
**禁止**在 tool 回调里直接等价于「只回 A、无视主线」。

### `GET /api/health`

探活，供启停与面板使用。

SSE 可作为后续增强；MVP 以同步 JSON + 主线队列为准。

## 8. 安装、配置与错误处理

### 指令

| 指令 | 行为 |
|------|------|
| `#安装悠悠` | clone/pull yoyo-sauce → `server/` → 依赖 → 启动 → 安装聊天插件入口 |
| `#卸载悠悠` | 停服、移除入口 |
| `#启动/停止/重启悠悠` | 管理 server 进程 |

### 配置（示意）

- 白名单群、唤醒词、缓冲条数、timeline 上限
- LLM：apiKey / baseUrl / model
- 最大气泡数、条间延迟
- 打断开关（默认开）
- 主动回复频率 / 冷却
- 工具开关（第一版可仅留扩展点或少量 job）

面板：`/yoyo` 增加「聊天」分组（非旧 Agent Harness 面板）。

### 错误

| 情况 | 行为 |
|------|------|
| skip | 不说话 |
| 被打断的 thinking 轮 | 不说话；跟新主线结果 |
| LLM 失败 | 主动发起时可短句兜底；旁听 skip 路径可静默 |
| 服务未启动 | 主动发起可提示未启动；避免 skip 路径刷屏 |

## 9. 实现分期

### MVP-1（先通主线）

- 插件：每条上报、缓冲、启停安装、发气泡、turn_gen
- server：主线队列、should_respond 规则、人设、单次 LLM、skip/reply
- 打断：thinking abort；无真实工具时 phase 以 thinking/idle 为主
- 可用 mock `tool_running` 测 ack 与回注（可选）

### MVP-2

- 真实异步工具（如画图）+ `tool_done` 回注 + 先 A 后 B 叙事
- ack_busy 短调用
- 面板聊天配置

### 后续（可选）

- 更智能的 should_respond（小模型分类）
- 无人点名时的低频率插话
- SSE 流式

## 10. 测试要点

- 同群串行：无交错乱序气泡
- thinking 中主动发起：旧轮不发出，新轮正常
- tool_running 中 B 插话：job 不取消，有 ack；完成后主线同时交代 A 结果与 B 后续
- 游戏命令与聊天共存
- `#安装悠悠` 冷装路径

## 11. 决策记录

| 决策 | 选择 | 原因 |
|------|------|------|
| 运行时 | 自研 Chat Brain，不接 DSH | 可定制、与去 Harness 一致 |
| QQ 接入 | Yunzai，不引入 SnowLuma | 已有协议层 |
| 消息 | 每条判定，非仅 @ | 对齐群友产品 |
| 会话 | 同群单主线 | 避免多指令互不记账 |
| 工具完成 | 回注主线再说话 | 保证叙事连续 |
| 图鉴 | 仍用命令插件 | 准确、省聊天 token |
