# Multimodal + Sticker Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Chat Brain 支持一轮 vision 看普通图、旁路 VLM 缓存 QQ 表情包，并在回复时按语境/斗图检索发出表情包；纯图/纯链/纯表情不触发主模型。

**Architecture:** 插件透传 message 段并 fire-and-forget `POST /api/media/ingest`；server 旁路下载+表情包打标入库；主线 `should_respond` 策略 C + `_build_messages` 挂媒体占位并按需注入 `image_url`；回复 JSON 的 `sticker` 由 server 检索后变成 `image` 气泡。

**Tech Stack:** FastAPI / httpx / OpenAI-compatible chat+vision、本地 stickers 落盘 + YAML/SQLite 索引、Yunzai OneBot 段、现有 pytest。

**Spec:** `docs/superpowers/specs/2026-10-26-multimodal-sticker-design.md`

## Global Constraints

- 试验群：`1129762204`（已在 `chatInclude`）
- 一轮回复只调用一次主模型；表情包 VLM **不经** GroupMainline
- 纯图 / 纯链接 / 纯表情 → `skip`（策略 C）
- 视觉默认跟 `chatLlmBaseUrl` + `chatLlmModel`
- rkey URL 必须立刻下载；失败不阻断 chat
- 禁止暴露自己是机器人（persona 已有规则，出站文案保持）

---

## File map

| Path | Responsibility |
|------|----------------|
| `server/src/chat/media/segments.py` | 解析 OneBot 段 → MediaRef；渲染文本占位；判定 sticker vs photo；提取「有效文字」 |
| `server/src/chat/media/download.py` | httpx 下载 + sha256 落盘 `data/media/` |
| `server/src/chat/media/sticker_store.py` | stickers index CRUD / 检索 / 容量淘汰 |
| `server/src/chat/media/sticker_vlm.py` | 独立 VLM 打标（非 chat JSON） |
| `server/src/chat/media/ingest.py` | ingest 编排：下载 → 分类 → VLM → store |
| `server/src/chat/media/vision.py` | 组装本轮 `image_url` content parts |
| `server/src/chat/should_respond.py` | 增加 `has_meaningful_text` 门闩（策略 C） |
| `server/src/chat/mainline.py` | 用 segments 渲染；vision 注入；解析 sticker 气泡 |
| `server/src/chat/llm.py` | `complete` 支持 content 为 list parts |
| `server/src/api/media.py` | `/api/media/ingest`、`/api/stickers/search` |
| `server/src/main.py` | 挂载 media router |
| `api/chat/plugin.js` | 上报后 ingest；无需改协议字段 |
| `api/chat/client.js` | `ingestMedia` 辅助 |
| `config/default.yaml` + `settings.py` + `web-config-schema.js` | 配置与面板 |
| `server/prompts/persona.md` | sticker / 看图约定 |
| `server/tests/test_media_*.py` | 单测 |

---

### Task 1: Segment parse + meaningful text + trigger C

**Files:**
- Create: `server/src/chat/media/__init__.py`
- Create: `server/src/chat/media/segments.py`
- Modify: `server/src/chat/should_respond.py`
- Modify: `server/src/chat/mainline.py`（用 `effective_text` / `has_meaningful_text`）
- Test: `server/tests/test_media_segments.py`, `server/tests/test_should_respond.py`

**Interfaces:**
- Produces:
  - `dataclass MediaRef`: `kind: Literal["photo","sticker","face","mface","link"]`, `url: str`, `path: str`, `summary: str`, `face_id: str`, `meta: dict`
  - `parse_message_segments(message: dict) -> list[MediaRef]`
  - `render_media_placeholders(refs: list[MediaRef]) -> str`
  - `effective_text(message: dict) -> str`（仅 text/@/face 文案，不含纯 url 段）
  - `has_meaningful_text(message: dict) -> bool`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_media_segments.py
from src.chat.media.segments import (
    effective_text,
    has_meaningful_text,
    parse_message_segments,
    render_media_placeholders,
)

def test_parse_image_and_text():
    msg = {
        "message": [
            {"type": "text", "text": "看看"},
            {"type": "image", "url": "https://x/a.jpg", "summary": "[动画表情]", "sub_type": 1},
        ],
        "raw_message": "看看[动画表情]",
    }
    refs = parse_message_segments(msg)
    assert any(r.kind == "sticker" for r in refs)
    assert effective_text(msg) == "看看"
    assert has_meaningful_text(msg) is True

def test_pure_image_no_meaningful_text():
    msg = {"message": [{"type": "image", "url": "https://x/a.jpg"}], "raw_message": "[图片]"}
    assert has_meaningful_text(msg) is False

def test_render_placeholder():
    from src.chat.media.segments import MediaRef
    s = render_media_placeholders([MediaRef(kind="photo", url="https://x/a.jpg", path="", summary="", face_id="", meta={})])
    assert "https://x/a.jpg" in s
```

```python
# extend tests/test_should_respond.py
from src.chat.should_respond import decide

def test_skip_when_no_meaningful_text_even_if_wake_in_raw():
    # mainline will pass has_meaningful_text=False → skip before decide
    # unit the helper path:
    from src.chat.media.segments import has_meaningful_text
    msg = {"message": [{"type": "image", "url": "https://x"}], "raw_message": "[图片]"}
    assert has_meaningful_text(msg) is False
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd server && .venv/bin/python -m pytest tests/test_media_segments.py -v
```

- [ ] **Step 3: Implement `segments.py`**

- OneBot 段兼容 `seg.url` / `seg.data.url` / `seg.file`。
- sticker 判定：`summary` 含「表情」或 `sub_type not in (None, 0, "0")`。
- `effective_text`：拼接 `text` + `@qq` + face 映射短名；**不要**把 raw 里的 `[CQ:image…]` 当有效字。
- `has_meaningful_text`：`effective_text` 去空白后长度 ≥ 1，且不全是标点。

- [ ] **Step 4: Wire mainline gate**

在 `handle()` 取 text 后：

```python
from src.chat.media.segments import effective_text, has_meaningful_text

text = effective_text(req.message) or _message_text(req.message)
if not has_meaningful_text(req.message) and not self._is_active_initiate(req):
    # 纯媒体且非主动：直接 skip（策略 C 的旁听）
    ...
# 主动发起但无有效文字（纯图表情 @）：也 skip
if self._is_active_initiate(req) and not has_meaningful_text(req.message):
    return ChatData(action="skip", reason="media_only")
```

注意：若 `@` 伴随空文本，`hints_at_bot` 仍可能 true —— **按规格 C 仍 skip**。

- [ ] **Step 5: Run tests — expect PASS**

```bash
.venv/bin/python -m pytest tests/test_media_segments.py tests/test_should_respond.py tests/test_mainline.py -q
```

- [ ] **Step 6: Commit**（仅当用户要求提交时再 commit；默认跳过）

---

### Task 2: Download + media cache + ingest API stub

**Files:**
- Create: `server/src/chat/media/download.py`
- Create: `server/src/chat/media/ingest.py`（先只下载分类，VLM 空实现）
- Create: `server/src/api/media.py`
- Modify: `server/src/main.py`
- Create: `server/data/media/.gitkeep`, `server/data/stickers/.gitkeep`
- Modify: `server/.gitignore`（忽略 `data/media/**`、`data/stickers/files/**`，保留 gitkeep）
- Test: `server/tests/test_media_download.py`

**Interfaces:**
- Produces:
  - `async def fetch_to_cache(url: str, *, max_bytes: int, dest_dir: Path) -> tuple[Path, str] | None` → `(path, sha256)`
  - `async def ingest_message(*, group_id: str, message: dict, settings: Settings) -> dict`

- [ ] **Step 1: Failing test with httpx mock**

```python
import pytest
from pathlib import Path
from src.chat.media.download import fetch_to_cache

@pytest.mark.asyncio
async def test_fetch_to_cache(tmp_path, httpx_mock=None, monkeypatch):
    data = b"\x89PNG\r\n\x1a\n" + b"0" * 20
    class FakeResp:
        status_code = 200
        content = data
        def raise_for_status(self): pass
    class FakeClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def get(self, url): return FakeResp()
    monkeypatch.setattr("src.chat.media.download.httpx.AsyncClient", lambda **k: FakeClient())
    out = await fetch_to_cache("https://example/a.png", max_bytes=1_000_000, dest_dir=tmp_path)
    assert out is not None
    path, digest = out
    assert path.is_file()
    assert len(digest) == 64
```

- [ ] **Step 2: Implement download + ingest**

- 魔数猜扩展名：png/jpeg/gif/webp；否则 `.bin`。
- 超 `chatMediaMaxBytes` 返回 None。
- `ingest_message`：parse → 对每个有 url 的 ref 下载 → sticker 候选写入 stickers/files（尚不 VLM）→ 返回 `{ok, saved, stickers_pending}`。

- [ ] **Step 3: API**

```python
# src/api/media.py
@router.post("/api/media/ingest")
async def media_ingest(body: IngestBody):
    settings = get_settings()
    result = await ingest_message(group_id=body.group_id, message=body.message, settings=settings)
    return {"ok": True, **result}
```

`IngestBody`: `group_id: str`, `message: dict`

- [ ] **Step 4: Plugin fire-and-forget**

在 `api/chat/client.js` 增加 `ingestMedia(payload, cfg)`；`plugin.js` 的 `runChat` 在 `chatApi` 前后 `void ingestMedia(...).catch(...)`（不 await 阻塞）。

- [ ] **Step 5: pytest PASS**

---

### Task 3: Settings + vision one-shot inject

**Files:**
- Modify: `server/src/core/settings.py`
- Modify: `config/default.yaml`
- Create: `server/src/chat/media/vision.py`
- Modify: `server/src/chat/llm.py`（messages content 可为 list）
- Modify: `server/src/chat/mainline.py` `_build_messages`
- Test: `server/tests/test_media_vision.py`

**Interfaces:**
- Produces: `def select_vision_urls(*, message, recent, settings, referring: bool) -> list[str]`
- Produces: `def build_user_content(text_payload: str, image_urls: list[str]) -> str | list[dict]`

Settings 增加（yaml 驼峰同步 merge）：

```yaml
chatVisionEnabled: true
chatVisionMaxImages: 2
chatVisionIncludeRecentOnRefer: true
chatMediaMaxBytes: 8388608
chatStickerCacheEnabled: true
chatStickerVlmModel: ""
chatStickerLibraryCap: 120
chatStickerReplyEnabled: true
chatStickerMaxPerReply: 1
```

- [ ] **Step 1: Test select + content parts**

```python
def test_select_current_photo():
    from src.chat.media.vision import select_vision_urls
    from src.core.settings import Settings
    msg = {"message": [{"type": "image", "url": "https://x/p.jpg", "sub_type": 0}]}
    urls = select_vision_urls(message=msg, recent=[], settings=Settings(chat_vision_enabled=True), referring=False)
    assert urls == ["https://x/p.jpg"]  # 非 sticker

def test_build_multimodal_content():
    from src.chat.media.vision import build_user_content
    c = build_user_content("看图", ["https://x/p.jpg"])
    assert isinstance(c, list)
    assert c[0]["type"] == "text"
    assert c[1]["type"] == "image_url"
```

指代检测：`re.search(r"(这张|刚才那|看看这|那张图|图片里)", text)`。

- [ ] **Step 2: `_build_messages` 把 user content 换成 `build_user_content(...)`；system 仍为 str。**

- [ ] **Step 3: 表情包不进 vision urls（kind==sticker 排除）。**

- [ ] **Step 4: pytest + 现有 mainline 测试 PASS**

---

### Task 4: Sticker VLM + store + search

**Files:**
- Create: `server/src/chat/media/sticker_store.py`
- Create: `server/src/chat/media/sticker_vlm.py`
- Modify: `server/src/chat/media/ingest.py`（打标）
- Modify: `server/src/api/media.py`（search）
- Test: `server/tests/test_sticker_store.py`, `server/tests/test_sticker_vlm.py`

**Interfaces:**
- Produces:
  - `StickerStore.upsert(hash, path, tags: dict) -> None`
  - `StickerStore.search(query: str, *, limit=5) -> list[dict]`
  - `StickerStore.mark_used(hash) -> None`
  - `async def label_sticker(settings, image_path: Path) -> dict | None`

VLM messages：

```python
[
  {"role": "system", "content": "只输出 JSON：emotion,scene,ocr_text,aliases,usable_for"},
  {"role": "user", "content": [
    {"type": "text", "text": "标注这张表情包"},
    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
  ]},
]
```

用 **data URL**（避免过期外链）。模型名：`settings.chat_sticker_vlm_model or settings.llm_model`。

检索：对 `emotion/aliases/ocr_text/scene` 做分词/子串打分；同 hash 降权 `last_used_at` 近 10 分钟内的。

- [ ] **Step 1–4:** TDD 实现 store → mock VLM → ingest 接通 → `GET /api/stickers/search?q=`

---

### Task 5: Outbound sticker in reply + 斗图启发式

**Files:**
- Modify: `server/src/chat/llm.py` `parse_replies_json` 接受 `type=sticker`
- Modify: `server/src/chat/schema.py`（`ReplyBubble.type` 含 sticker **或** 主线内解析后转 image）
- Modify: `server/src/chat/mainline.py`（resolve sticker → image path）
- Modify: `server/prompts/persona.md`
- Test: `server/tests/test_sticker_reply.py`

**推荐：** schema 对外仍只发 `text|image`；mainline 在 parse 后把 sticker 解析成 image，避免插件大改。

```python
def resolve_sticker_bubbles(raw_bubbles, store, settings, *, boost_dou_tu: bool) -> list[ReplyBubble]:
    ...
```

斗图 boost：`recent` 或当前 refs 含 sticker，或 text 匹配 `斗图|来张|接一个|表情包`。

Persona 追加：

```text
- 可回表情包：在 JSON 加 {"type":"sticker","query":"情绪或关键词"}；没有合适就不要硬加
- 用户斗图时优先接一张表情包，仍保持短句，默认总共仍偏少气泡
```

- [ ] **Step 1–4:** 单测 mock store 返回 path → `_generate` 后 replies 含 image。

---

### Task 6: Panel + defaults + design cross-link

**Files:**
- Modify: `utils/web-config-schema.js`（媒体/表情包分组）
- Modify: `config/default.yaml`
- Modify: `docs/superpowers/specs/2026-10-26-qq-group-chat-brain-design.md`（链到 multimodal 规格）
- Modify: `docs/superpowers/specs/2026-10-26-multimodal-sticker-design.md` 状态 → 实现中/完成

- [ ] 面板字段与 settings 键一一对应  
- [ ] `pytest tests/ -q` 全绿  
- [ ] 人工：群 `1129762204` 发动画表情 → `data/stickers` 有文件；`@悠悠` 斗图有图回

---

## Spec coverage checklist

| Spec § | Task |
|--------|------|
| 触发 C | Task 1 |
| 立刻下载 / ingest API | Task 2 |
| 一轮 vision + 历史链接 | Task 3 |
| 旁路 VLM + 库 | Task 4 |
| 出站斗图 | Task 5 |
| 配置面板 | Task 6 |
| mface/face 降级 | Task 1 parse + Task 4 跳过无文件 |

## Placeholder scan

无 TBD；实现以本计划代码块为准。
