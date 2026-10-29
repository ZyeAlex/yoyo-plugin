# TTS 语音系统（OpenAI 兼容 + 模型声明）

日期：2026-10-29  
状态：**已实现（MVP）**  
范围：Chat Brain 用统一 OpenAI 兼容 TTS 客户端发 QQ 语音条；面板上传全局默认参考音色；模型按需声明 `tts`  
前置：

- 画画异步 job / 主线：[../../07-chat-brain-mainline.md](../../07-chat-brain-mainline.md)
- 出站回复：`api/chat/reply.js`（今日仅 text / image）
- 配置面板：`utils/web-config-schema.js`、`utils/web-panel.js`

参考（业界，不照搬多 Provider）：

- MaiBot TTS：概率转语音 + 多后端；参考音频 + 参考文本克隆
- AstrBot / MiMo：上传参考音频克隆；QQ silk/amr 转换
- OpenHanako CosyVoice：原生语音条 + 短句 + 情绪指令
- 统一协议趋势：`POST /v1/audio/speech`（Fish / vLLM-Omni / GPT-SoVITS 网关等）

---

## 1. 问题

悠悠只会打字和发图，不能发 QQ 语音条。各家 TTS 原生 API 不统一，但不应为每家写一套插件。

已定需求：

1. **触发**：模型声明 `{"type":"tts",...}`（对齐画画，不做概率自动、不做 `~说` 命令优先）
2. **音色**：全局一份默认音色；主人在 **Web 面板** 上传参考音频（可附参考文本）
3. **出站**：成功时 **只发语音条**，不重复同一句文字
4. **能力**：上传/更换默认音色、语速、试听、总开关与群开关、可选 style/情绪（后端不支持则忽略）
5. **接入**：像 LLM/画画一样，`base_url` + `api_key` + `model`，只认 OpenAI 兼容 speech

范围外（第一版不做）：

- 多音色库 / 按群音色
- QQ 指令同步音色
- 概率自动把文字改成语音
- STT（听语音转写）
- 各家私有协议直连（无兼容层则不接）

---

## 2. 选型

| 方案 | 要点 | 结论 |
|------|------|------|
| 多 Provider 插件（MaiBot/AstrBot 常见） | 每家一套；维护重 | 否 |
| 出站中间件劫持文字转语音 | 与「模型声明」冲突 | 否 |
| **OpenAI 兼容客户端 + draw 同款异步 job** | 本地/云端只换 URL；架构一致 | **采用** |

---

## 3. 架构

```
面板上传默认音色
  → server/data/tts/default.wav + default.json

人设 JSON（开关开且有音色可用）
  {"type":"tts","text":"短句","speed":1.0,"style":"开心?"}
       │
       ▼
异步 job（镜像 draw）
  _start_tts_job → run_tts_job
       │
       ▼
POST {chatTtsBaseUrl}/v1/audio/speech
  model / input / voice / speed / response_format
  + 有本地参考时：ref_audio（或等价扩展）+ ref_text
       │
       ▼
落盘 server/data/media/voice/{id}.wav
       │
       ▼
ReplyBubble(type="record", path=…)
  → api/chat/reply.js → segment.record(path)
  只发语音条；失败则短 text
```

同步工具（lookup/web）不走这条；TTS 与 draw 同属异步媒体 job。

---

## 4. 音色与配置

### 4.1 配置键

| 键 | 作用 |
|----|------|
| `chatTtsEnabled` | 总开关 |
| `chatTtsInclude` / `chatTtsExclude` | 群白/黑名单。`Include` 非空：仅这些群可 TTS；`Include` 空：凡已能进 Chat 的群都可（仍受 `chatInclude` 约束）。`Exclude` 命中则关闭。二者都空 = 不额外限制 |
| `chatTtsBaseUrl` / `chatTtsApiKey` / `chatTtsModel` | OpenAI 兼容端点 |
| `chatTtsVoice` | 后端预设 voice id；有本地参考音频时仍可传，默认 `"default"` 或配置值 |
| `chatTtsSpeed` | 默认语速 `0.5–2.0` |
| `chatTtsFormat` | 请求 `response_format`，默认 `wav` |
| `chatTtsMaxChars` | 单次合成字数上限（建议默认 80） |

Settings 映射对齐 `chatDraw*`：独立 profile 或 `settings.profile("tts")`  thr 出 base/key/model。

### 4.2 全局默认音色（面板）

- 上传：参考音频（wav/mp3 等；建议 3–15 秒清晰人声）+ 可选参考文本
- 落盘：
  - `server/data/tts/default.wav`（或统一转存 wav）
  - `server/data/tts/default.json`：`prompt_text`、`updated_at`、原文件名
- 合成：
  - **有本地文件**：兼容 body 带扩展 `ref_audio`（base64 data URL 或实现选定的一种）+ `ref_text`；`voice` 用配置值
  - **无本地文件**：仅 `voice`（纯预设音色也可跑通）
- 面板：**上传、清除、试听**（固定短句调 speech，音频只回面板，不进群、不占主线 job）
- 权限：仅面板主人；群友不能上传

合规：上传须为本人或已授权声音；实现时可在面板放一句提示，不做法务拦截引擎。

---

## 5. 模型工具面与 job

### 5.1 何时注入【语音工具】

同时满足：

1. `chatTtsEnabled`
2. 当前群通过 TTS include/exclude
3. 已配置可用模型端点，且（存在默认参考音频 **或** 配置了非空 `chatTtsVoice`）

否则 system **不提** TTS，避免空口承诺。

### 5.2 声明

```json
{"type":"tts","text":"要念的短句","speed":1.0,"style":"开心"}
```

- `text` 必填；超 `chatTtsMaxChars` **截断**后再合成
- `speed` / `style` 可选；style 后端不认则忽略，不因此失败整轮
- 同轮可有其他 bubble；**成功出站的 tts 轮：群里只发 record**，不把同一句 text 再发一遍
- 等待期间默认 **静默**（不发「稍等」），与「只发语音条」一致；busy 时别人 @ 仍走现有 `ack_busy`

### 5.3 生命周期

1. `parse_persona_json` 接受 `type=tts`
2. `_start_tts_job`：登记 job（`name=语音`），`phase=tool_running`
3. `run_tts_job`：HTTP speech → 写 `data/media/voice/`
4. `_on_tool_done`：按 `result.kind == "audio"` 插入 `record` bubble（**必须**把现有「有 path 就插 image」改成按 kind 分支，避免画/语音互踩）
5. 失败：一条短 text（如「这句没发出去」）；禁止假装已发语音

### 5.4 人设纪律

- 禁止说「发语音了」却不声明 `tts`
- 长解释、列表、指令引导优先 text；语音留给短句、情绪、强调
- 非星原群「别人的指令」规则不变：指令场景不要用 tts 接戏

---

## 6. QQ 发送与失败

### 6.1 Schema / 发送

- `ReplyBubble.type` 增加 `"record"`，字段 `path`
- `api/chat/reply.js`：`segment.record(path)`
- 路径必须落在 `server/data/media/voice/`（与 sticker/draw 同样 confine）
- silk：若运行环境需要，在落盘后或发送前可选 wav→silk；探测不到转换器则直接发 wav，交给适配器

### 6.2 开关与丢弃

总关 / 群排除 / 无音色且无 voice：不注入工具面。  
模型仍声明 `tts` → **静默丢弃该声明**（不吵、不当成功）。

### 6.3 失败表

| 情况 | 行为 |
|------|------|
| 未配置 base/model | 不注入；声明丢弃 |
| API 错误 / 超时 | 短 text 失败一句 |
| 超字数 | 截断后合成 |
| 写文件失败 | 短 text 失败 |
| 面板试听失败 | 面板报错，不进群 |

---

## 7. 测试

- Mock `/v1/audio/speech` 返回固定 wav 字节
- 注入：关开关 / 无音色 / 群 exclude 时 system 无【语音工具】
- 解析：`tts` → job → outbox `record`
- `sendReplies` 对 `record` 调用 `segment.record`
- 回归：draw 的 `result.kind=image`（或等价）不被 TTS 改坏
- 面板试听：不写主线 outbox

---

## 8. 实现落点（供计划拆任务）

| 区域 | 文件（预期） |
|------|----------------|
| 设置 | `config/default.yaml`、`settings.py`、`web-config-schema.js` |
| 音色存储 / 试听 API | `server/src/api/`（新媒体或挂 web 代理）、`data/tts/` |
| 客户端 | `server/src/chat/tts/` 或 `jobs.py` 内 `run_tts_job` |
| 主线 | `mainline.py`、`llm.py`、`schema.py`、persona 提示块 |
| QQ | `api/chat/reply.js` |
| 测试 | `server/tests/test_tts_*.py` |

改完 server / 人设后需 `#重启悠悠`。

---

## 9. 决议摘要

| 项 | 决议 |
|----|------|
| 触发 | 模型声明 `tts` |
| 音色 | 全局默认；面板上传 |
| 出站 | 仅语音条 |
| 协议 | OpenAI 兼容 `/v1/audio/speech` |
| 风格 | 可选；后端不支持则忽略 |
| 不做 | 多音色、QQ 同步音色、概率自动语音、STT |
