# 游戏知识注入（L0 / L1，MVP）

> 规格全文：[2026-10-28-game-knowledge-injection-design.md](./superpowers/specs/2026-10-28-game-knowledge-injection-design.md)（**MVP 已实现**）  
> Wiki 数据真相：[04-wiki-data-and-cache.md](./04-wiki-data-and-cache.md)  
> 主线接入：[07-chat-brain-mainline.md](./07-chat-brain-mainline.md)  
> 记忆拒写 lore：[08-chat-brain-memory-layer.md](./08-chat-brain-memory-layer.md)  
> 能力 / 指令引导：[10-capabilities-and-stickers.md](./10-capabilities-and-stickers.md)

## 1. 分层（本期）

| 层 | 行为 | 状态 |
|----|------|------|
| **L0** | 每轮 system：`【星原世界观】`（lore 白名单章节）+ `【悠悠自己｜图鉴】`（默认 `101003`）+ 纪律 | 已实现 |
| **L1** | 人设 JSON 声明 `lookup` / `expand` → 服务端查 `data/game/*.yaml` → 卡片回注 | 已实现 |
| L2 | `guide_search` / lore 段落检索 / 攻略图 VLM 摘要 | **非目标** |
| L3 | 实体 Embedding 模糊检索 | **非目标** |

Chat **只读**插件已有 YAML；**不在** chat 进程爬 Wiki。`#更新*` 刷新 yaml 后，Python `loader.py` 按 **mtime** 热加载，一般无需 `#重启悠悠`。

## 2. L1 两段式主线

1. 首轮 LLM 可在 `replies` 里写 `{"type":"lookup",...}` / `{"type":"expand",...}`（见规格 §6）。  
2. `mainline._maybe_game_lookup`：最多 **`chatGameLookupMax`** 次（默认 2）→ `run_lookups` → trace `game_lookup`。  
3. 带 **【工具结果】** 再调一轮人设；剩余 lookup/expand 气泡剥离，再走 draw / sticker 等原路径。  
4. 查无：卡片 `{ok:false}` + hint；**单名问答不要用 `~指令` 敷衍**（见下）。

与 **`is_game_command`**：正文已是游戏指令时仍 skip 闲聊，两段式不抢答命令插件。

### 2.1 教模型调用（不做 kind 兜底）

服务端 **`lookup_entity` 只在声明的 kind 内查**；错 kind（如把「蝶语迷梦」当 `pet`）会 `ok:false`，**不**自动跨类型猜。要模型自己选对 kind。

| 面 | 内容 |
|----|------|
| `persona.md`「图鉴工具」专节 | 何时必须查、kind 表（hero/pet/suit…）、示例；追问要答事实 |
| system `【图鉴工具｜本轮可声明】` | 与 persona 对齐的短契约 |
| L0 纪律 | 事实以本块/【工具结果】为准；单名走 lookup；整页才推 `~` |
| 能力块（help） | **整页图鉴/面板/签到** → 引导 `~指令`；闲聊单名 → lookup，勿假装已查 |

禁止空口「我去查了 / 没这号」却不声明工具；【近期群聊】里刚用工具答过的可复述事实，勿只回「查过了还问」。

### 2.2 运维注意

- `persona.md`：**按 mtime 热加载**（勿永久 `lru_cache`），改提示不必为 persona 单独杀进程；**改 `mainline.py` 仍需重启 uvicorn**。  
- 端口被旧进程占着时，新进程起不来 → 群仍跑旧代码。重启前确认只剩一个监听 `chatPort` 的进程。  
- 自测脚本：`server/scripts/debug_game_kb_llm.py`（真 LLM 声明 + 两段式）。  
- 复盘：群 `trace.jsonl` 看 `persona` 是否含 `【图鉴工具｜本轮可声明】`、`game_lookup` 的 ops/result。

## 3. 配置（`config/default.yaml` / 面板）

| 键 | 默认 | 说明 |
|----|------|------|
| `chatGameKbEnabled` | `true` | 关则跳过 L0 注入与 L1 两段式 |
| `chatGameSelfHeroId` | `101003` | L0 悠悠名片 id |
| `chatGameL0MaxChars` | `2800` | L0 硬顶字符 |
| `chatGameLookupMax` | `2` | 每轮 lookup+expand 上限 |

## 4. 关键代码

- `server/src/chat/game_kb/`：`loader.py`（mtime YAML）、`cards.py`（L0 + 瘦卡片）、`resolve.py` / `expand.py`、`run_lookups`  
- `server/src/chat/mainline.py`：`_build_messages` 注入 L0 + 工具面；`_generate` → `_maybe_game_lookup`  
- `server/src/chat/llm.py`：`lookup`/`expand` 不占 `max_replies` 文字预算  
- `server/prompts/persona.md`：图鉴工具专节  
- 单测：`server/tests/test_game_kb_*.py`

## 5. 角色外观 look（与图鉴解耦）

> 规格：[2026-10-28-hero-look-draw-ref-design.md](./superpowers/specs/2026-10-28-hero-look-draw-ref-design.md)

| 键 | 默认 | 说明 |
|----|------|------|
| `chatHeroLookEnabled` | `true` | look 两段式总开关 |
| `chatHeroLookMaxPerTurn` | `1` | 每轮 look 上限（与 lookup **分计**） |

- Node `getHeroImgs()` 写入 `data/cache/hero_imgs.json`；Python 只读索引，不复刻 `getHeroId`。  
- 人设声明 `{"type":"look","q":"…"}` →【工具结果】`desc` + `ref_available`（无 path）。  
- 画画可选 `{"type":"draw","prompt":"…","use_ref":true}` 挂载上次 look 立绘；**用户本条普通图优先**。

## 6. 非目标（跟进计划）

- L2：`guide_search`、lore section 检索、攻略图 VLM / `guide_summaries`  
- L3：Embedding 模糊问法  
- Chat 侧 Wiki 抓取、社区第三方攻略源  
- lookup 错 kind 时服务端跨类型兜底（刻意不做，逼模型选对 kind）  
- 奇波/道具外观、多角色拼 ref
