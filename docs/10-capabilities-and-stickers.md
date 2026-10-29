# 能力自知（help.yaml）与表情货架

> 热度 / transcript：[09-group-heat-transcript.md](./09-group-heat-transcript.md)  
> 主线：[07-chat-brain-mainline.md](./07-chat-brain-mainline.md)  
> 货架规格：[2026-10-27-sticker-shelf-awareness-design.md](./superpowers/specs/2026-10-27-sticker-shelf-awareness-design.md)  
> 发送频率（调研 + 当前提示词试验）：[2026-10-28-sticker-frequency-design.md](./superpowers/specs/2026-10-28-sticker-frequency-design.md)  
> 面板 HUD：[2026-10-27-config-center-hud-design.md](./superpowers/specs/2026-10-27-config-center-hud-design.md)

## 1. 能力自知（2026-10-27）

问题：人设不知道自己有哪些机器人能力，容易瞎编「已查图鉴」。

方案 A（已落地）：

- 模块：`server/src/chat/help_capabilities.py`
- 真相源：插件根 `config/help.yaml`（与 `apps/help.js` 帮助图一致）
- **能力注入**：按 group + `title`/`desc` 压成短清单，拼进人设 **system**（无 icon）
- **指令前缀**：help.yaml 里 `#` 是占位；注入时换成 `config.yaml` 的 `rulePrefix[0]`（当前 `~`）
- **提示**：能力块写明「整页图鉴/面板/签到直接发指令，不需要 @悠悠」；闲聊里单名问答走 Chat **lookup/expand**（见 [12](./12-game-knowledge.md)），不要用「发 `~图鉴`」敷衍，也不要假装已查/已执行指令
- **mtime 缓存**：改 help/config 后下次请求自动刷新
- **游戏指令 skip**：从 title 派生正则
  - 固定项（`~签到`、`~角色图鉴`…）：匹配 `rulePrefix` 与 `#～~`
  - 角色占位（help 里「寒悠悠」示例）：替换为 `.{1,12}`，**必须带前缀**，避免「我想看xx图鉴」误判

人设约定：**面板类**引导发 `rulePrefix` 指令；**专名闲聊**声明 lookup，勿空口编数值。

## 2. 表情包货架（策略 B）

问题：入库/VLM 打标有了，但主模型不知道货架上有什么，也不会稳定选出站 sticker。

已定：

| 项 | 结论 |
|----|------|
| 注入 | **按需**：斗图/`wants_dou_tu` 必开货架；平时按 `chatStickerShelfChance`（默认 0.45）掷骰。未打开则不注入 |
| 选择 | 有货架时模型自选 id；无货架则只能打字。服务端不删文字，也不补图 |
| 解析 | `resolve_sticker_bubbles` 按 id 发图；没选 id / 无货架 id 就不发图 |

关键代码：

- `server/src/chat/media/sticker_store.py` / `sticker_vlm.py` / `ingest.py`
- `mainline.py`：`build_sticker_shelf`、`resolve_sticker_bubbles`
- 配置：`config/default.yaml` 货架相关键；VLM 用 **vision** profile（文本模型拒图）

## 2.1 发送频率（2026-10-28，已改门闩）

问题：货架每轮可见 ≈ 表情工具常挂工具栏；软概率提示在 `608161397` 验证无效。出站**没有**自动塞图。

已落地（对齐工具面，少规则）：

- `build_sticker_shelf`：斗图必开；非斗图 `chatStickerShelfChance`（默认 0.45）才注入。
- 人设只保留：有【可发表情】才能写 sticker。
- 配置 / 面板：`chatStickerShelfChance`。

全文见 [`2026-10-28-sticker-frequency-design.md`](./superpowers/specs/2026-10-28-sticker-frequency-design.md)。

## 2.5 TTS 语音（2026-10-29）

规格：[2026-10-29-tts-voice-system-design.md](./superpowers/specs/2026-10-29-tts-voice-system-design.md)

- 协议：OpenAI 兼容 `POST /v1/audio/speech`（`chatTtsBaseUrl` / `ApiKey` / `Model`）
- 触发：人设声明 `{"type":"tts","text":"…"}` → 异步 job → QQ `segment.record`
- 音色：面板「语音 TTS」上传全局 `server/data/tts/default.wav`（可填参考文本）；试听走 `/api/tts/preview`
- 出站成功时**只发语音条**；关 `chatTtsEnabled` 或不配模型/无音色则不注入工具面
- 改完需 `#重启悠悠`

## 3. 纯媒体与开口

不堆「禁止催话」词表。纯图 / 纯表情照进 transcript + 热度。

- **跟聊**（`persona` / `hold`）遇到无文字媒体 → `media_listen`，不喂人设
- **攒批 / 快判 / @** 仍走原路径；当前句带 sticker 时 `wants_dou_tu` 仍会开货架

注意：纯图占位文本如 `[图片]` 不得被当成「xx图片」游戏指令；`is_game_command` 排除纯媒体占位，且角色模板须带 `#`。

## 4. 面板（Web 配置中心）

- HUD 向「星原作战台」：`resources/web/{index,style,app}.{html,css,js}`
- 命名：原「基础」→ **插件配置**（含娱乐）；原「群聊」→ **智能体配置**
- 去掉重 `backdrop-filter` 以减轻卡顿
- schema：`utils/web-config-schema.js`；面板：`utils/web-panel.js`

## 5. 改动守则

1. 能力列表只改 `config/help.yaml`，不要在 chat 里再抄一份。
2. 不要恢复问句/闭嘴/画画启发正则；插话节奏交给热度攒批 + 快模型接话门闩。
3. 表情出站必须经货架 id；空货架或 `none` 时不要承诺已发图。
4. 频率靠货架是否注入，不要再堆长段概率 prompt；不要恢复「漏选自动塞图」。
5. 改完 server / 人设需 `#重启悠悠`。
