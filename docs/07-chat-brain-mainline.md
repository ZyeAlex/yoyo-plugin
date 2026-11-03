# Chat Brain 主线（群聊大脑）

> 正式规格：[`superpowers/specs/2026-10-26-qq-group-chat-brain-design.md`](./superpowers/specs/2026-10-26-qq-group-chat-brain-design.md)  
> 记忆层专题：[`08-chat-brain-memory-layer.md`](./08-chat-brain-memory-layer.md)

---

## 1. 一句话

QQ 群内像群友一样聊天：**同群一条主线**；插件只做 QQ 适配，推理与记忆全在 `server/`（yoyo-sauce）。

---

## 2. 职责边界（硬）

| 层 | 路径 | 做 | 不做 |
|----|------|----|------|
| 插件 | `api/chat/*`、`apps/chat.js`、`utils/chat-server.js` | 白名单、缓冲、`POST /api/chat`、发气泡、启停、`#安装悠悠`、面板 | 不调 LLM、不跑工具、不写记忆 |
| server | `server/src/chat/*` | `should_respond`、主线、persona、LLM、tool job、记忆读写 | 不直连 QQ |
| 游戏命令 | `apps/atlas.js` 等 | `#图鉴` / `#签到` 等 | **不**经 Chat Brain 当工具 |

对照（仅职责映射，不接对方运行时）：

```text
他们：QQ → SnowLuma → qq-bridge → DSH
你们：QQ → Yunzai → yoyo-plugin → yoyo-sauce（Chat Brain）
```

**明确不做**：DSH / Mem0 / SnowLuma / 旧 Harness（ReAct 工具目录、游戏查库工具链）。

---

## 3. 部署与指令

- 后端仓：`https://gitee.com/yoyo-plugin/yoyo-sauce.git` → 本地 `plugins/yoyo-plugin/server/`
- 指令：`#安装悠悠` / `#卸载悠悠` / `#启动悠悠` / `#停止悠悠` / `#重启悠悠`
- 配置：`config/config.yaml`（默认见 `config/default.yaml`）；面板「群聊」分组 `utils/web-config-schema.js`
- 进程：uvicorn `src.main:app`，端口 `chatPort`（默认 8787）

---

## 4. 同群单主线

- `session_id = group:{gid}:bot:{bid}`
- 核心类：`server/src/chat/mainline.py` → `GroupMainline` / `MainlineManager`
- 字段：`timeline`、`jobs`、`phase`（`idle|thinking|tool_running`）、`turn_gen`、`outbox`、`pending_users`
- **禁止**为工具或插话另开独立聊天 session
- 对群开口只有主线出口（串行）

### 打断（不销会话）

| phase | 主动发起（@ / 唤醒 / 引用 bot） | 行为 |
|-------|-------------------------------|------|
| `thinking` | 是 | abort LLM，`turn_gen++`，不清 timeline |
| `tool_running` | 是 | **不** cancel job；`ack_busy`；记 pending |
| 任意 | 否 | 入 timeline；由 should_respond 决定 |

过期气泡：插件侧用 `turn_gen` 丢弃。

---

## 5. 开口

`chatHeatEnabled: true`（默认）时走温度调度，见 [09-group-heat-transcript.md](./09-group-heat-transcript.md) · [addressivity 规格](./superpowers/specs/2026-10-27-addressivity-observe-design.md)。

- **idle / observe**：攒批 → **快模型厚判接话** → 通过才进 **人设薄判意愿** + 写正文。插完不进热聊，温度封顶 0.25
- **engaged**（被 @ / 点名 / 回复她）：唯一 `partner_id` 短窗；开口一律防抖攒句（思考中打断合并，说完后也等几秒），再人设；可空回；不跑快模型门闩
- **observe**：非主体发言或窗过期 → 旁听，仍走攒批 + 快模型
- **engagement**（人设）：`up|hold` 续短窗；`down`→observe；`leave`→idle。不是「该不该开口」的判定
- 详见 [09](./09-group-heat-transcript.md)；**不要删快模型层，只放宽门禁**

`chatHeatEnabled: false` 时 `should_respond.decide` **仅硬触发**（已无短问 proactive 正则）。

纯图/表情：**不**再 `media_only` early-skip；一律进 transcript + 热度。

能力自知与表情货架见 [10-capabilities-and-stickers.md](./10-capabilities-and-stickers.md)。

---

## 6. 回复形态（防刷屏）

- 默认 **`chatMaxReplies: 2`**；persona：短句、少喊昵称、少「。」；默认 1 泡，两意两泡
- 输出 JSON：`{"engagement":"hold","replies":[...]}`；`replies:[]` = 本轮不说话
- 人设：`server/prompts/persona.md`；system 另注入 help、记忆、货架、【对话主体】
- 工具收尾可配图；尽量短

---

## 7. 异步工具（MVP-2）

- 开关：`chatToolsEnabled`；`jobs.py` mock 画画管线仍在
- **已去掉**「帮我画」等正则自动开 job；入口待接 tool / 模型声明
- 流程（手动/内部调用 `_start_draw_job`）：短应答 → `tool_running` → 完成后 **outbox** → `GET /api/chat/pending`
- 叙事：同一主线收尾，不要支线私发

### 7.1 联网搜索（同步两段式）

无 API Key。模型在 `replies` 里声明，服务端抓公开搜索页，结果回注同一主线后再开口。搜索不抓正文。

| 声明 | 行为 |
|------|------|
| `{"type":"web_search","q":"检索词","intent":"general"}` | 仅 Bing HTML。成功后**自动抓取 Top1 正文**一并回注 |
| `{"type":"web_fetch","url":"..."}` | 打开指定结果正文（覆盖默认 Top1）。`url` 必须是工具结果里的真实链接 |

- 引擎只保留 Bing。不走 DuckDuckGo / Tavily / 百度 / 搜狗 / Playwright。
- 给模型的字段：`snippet`→`content`，`confidence_score`→`score`。没有 title 或 url 的条目丢掉。
- 无结果或失败：明确说没搜到，禁止编造 URL。
- 搜索声明本身不出群；正文优先看自动/`web_fetch` 的 `web_fetch` 块。
- 开关：`chatWebSearchEnabled`（默认开）、`chatWebSearchMaxResults`（默认 10，面板上限 10）。
- 代码：`server/src/chat/web_search/`。

---

## 8. 插件关键文件

| 文件 | 职责 |
|------|------|
| `api/chat/plugin.js` / `apps/chat.js` | 群消息入口、turn_gen、发气泡 |
| `api/chat/client.js` | HTTP 客户端 |
| `api/chat/reply.js` | `sendReplies` |
| `utils/chat-server.js` | 启停 / 健康检查 |
| `apps/update.js` + `utils/uv.js` | `#安装悠悠` 拉仓与依赖 |
| `resources/web/*` + `utils/web-*.js` | 配置中心 HUD（插件配置 / 智能体配置） |

---

## 9. server 关键文件

| 文件 | 职责 |
|------|------|
| `src/api/chat.py` | `/api/health` `/api/chat` `/api/chat/pending` `/api/memory/reindex` |
| `src/chat/mainline.py` | 主线编排、货架注入、能力注入 |
| `src/chat/should_respond.py` | 硬触发；`is_game_command` 转 help |
| `src/chat/help_capabilities.py` | help.yaml → 能力文案 + 指令 skip |
| `src/chat/temperature.py` | idle/engaged/observe、partner 短窗、攒批、退避 |
| `src/chat/transcript.py` | 逐条群记录 |
| `src/chat/outbound.py` | 出站 CQ 净化 |
| `src/chat/llm.py` | OpenAI 兼容补全 + JSON 解析 |
| `src/chat/jobs.py` | mock 画画 |
| `src/chat/web_search/` | Bing 搜索；搜完自动/`web_fetch` 抓公开页正文 |
| `src/chat/media/*` | 媒体段、ingest、sticker 货架/VLM |
| `src/chat/memory/*` | 见专题 08 |
| `src/core/settings.py` | 配置（含记忆键） |

测试：`cd server && uv run pytest tests/ -q`（2026-10-27 约 98 passed）。

---

## 10. 改动守则（给 AI）

1. 不把游戏图鉴查库塞进 Chat Brain 工具调用；能力与指令 skip 只维护 `config/help.yaml`。
2. 不接 DSH / Mem0；记忆只走 `server/src/chat/memory/`。
3. 同群不新开第二会话；tool 结果必须回注主线。联网搜索只走 Bing 的 `web_search`（自动抓 Top1）/ `web_fetch`，不要接 Tavily，也不要编造 URL。
4. 改配置键时同步：`default.yaml` + `settings.py` + `web-config-schema.js`。
5. **不要**恢复问句/闭嘴/画画启发正则；插话交给热度攒批 + 快模型接话门闩 + 人设意愿。优化门禁松紧，不要删掉快模型层。
6. 改行为后更新本专题、09、10 与规格，并跑 pytest；改完需 `#重启悠悠`。
