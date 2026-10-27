# Sticker Shelf Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让悠悠在一轮对话里看见「收到的表情短标签」和「本轮可发表情候选」，用 `sticker.id` 显式选图发出，并把「发了什么」写回 transcript；漏选不偷偷塞图（策略 B）。

**Architecture:** 旁路 ingest 只把 VLM 打标成功的条目放进货架；主线在斗图倾向时注入 ≤K 条候选（短 id→hash/path）；模型 JSON 选 id 或 none；resolve 只认本轮映射；出站成功后 timeline/transcript 写同形短标签。删除现有 `boost_dou_tu + pick_any` 自动塞图路径。

**Tech Stack:** FastAPI server（pytest）、SQLite `StickerStore`、现有 vision profile VLM、Yunzai 插件出站 `segment.image`、面板 `web-config-schema.js`。

**Spec:** `docs/superpowers/specs/2026-10-27-sticker-shelf-awareness-design.md`

## Global Constraints

- 一轮回复只调用一次主模型；表情 VLM 不经 GroupMainline
- 策略 B：模型 `none` / 漏选 / 非法 id → **不**自动 `pick_any` 出站
- 纯图 / 纯链 / 纯表情 → `media_only` skip（策略 C 不变）；ingest 仍可跑
- VLM 必须走 `settings.profile("vision")`（已实现于 `sticker_vlm.py`，勿回退到文本模型）
- 未标注 / stub **不得**进入 shelf / 出站
- 出站 path 必须禁闭在 `server/data/stickers` 或 `server/data/media`
- 试验群：`1129762204`（已在 `chatInclude`）

---

## File map

| Path | Responsibility |
|------|----------------|
| `server/src/chat/media/sticker_store.py` | 新增 `shelf()`；短描述 helper；保持 `search` / `pick_any`（pick_any 仅供 shelf 补齐，**不**给 boost 出站） |
| `server/src/chat/media/segments.py` | 短标签渲染；可选传入 store 解析已入库描述；mface 有 URL 当 sticker 下载候选 |
| `server/src/chat/media/ingest.py` | mface 有 URL 走 sticker 管道；失败删文件（已有则核对） |
| `server/src/chat/mainline.py` | 候选注入、`StickerShelf` 本轮映射、`resolve_sticker_bubbles` 改 id；删 boost 自动发图 |
| `server/src/chat/llm.py` | `parse_replies_json` 接受 `id` / `none` |
| `server/src/chat/transcript.py` | 入站短标签；bot 行支持表情描述 |
| `server/src/core/settings.py` | `chatStickerShelfSize` / `chatStickerShelfEnabled` |
| `config/default.yaml` | 同上默认值 |
| `utils/web-config-schema.js` | 面板两项 |
| `server/prompts/persona.md` | 候选 id 约定 + 禁止虚诺 |
| `server/tests/test_sticker_store.py` | shelf / unlabeled |
| `server/tests/test_sticker_reply.py` | 注入 resolve 策略 B |
| `server/tests/test_sticker_labels.py` | 新建：短标签 / transcript |
| `server/tests/test_media_segments.py` | mface→sticker 若改分类 |

---

### Task 1: Store `shelf()` + short caption helper

**Files:**
- Modify: `server/src/chat/media/sticker_store.py`
- Test: `server/tests/test_sticker_store.py`

**Interfaces:**
- Produces:
  - `short_caption(tags: dict) -> str` — 优先 `ocr_text`，否则首个 alias，否则首个 emotion，否则 `"表情"`
  - `StickerStore.shelf(*, limit: int = 5, exclude_hashes: set[str] | None = None) -> list[dict]`  
    每项含 `hash`, `path`, `tags`, `hits`, `score`（≥2.0，近期 used 降权）, `caption`（短名）  
    只返回 `_tags_labeled` 为真的行；按 score/hits 排序

**Consumes:** 现有 `_tags_labeled`、`RECENT_USED`、`_parse_ts`

- [ ] **Step 1: Write failing tests**

```python
# 追加到 server/tests/test_sticker_store.py
from src.chat.media.sticker_store import StickerStore, short_caption

def test_short_caption_prefers_ocr():
    assert short_caption({"ocr_text": "菜到安详", "emotion": ["摆烂"]}) == "菜到安详"
    assert short_caption({"emotion": ["无奈"], "aliases": []}) == "无奈"

def test_shelf_skips_unlabeled_and_respects_limit(tmp_path):
    store = StickerStore(tmp_path / "i.sqlite", cap=20)
    store.upsert("h1", str(tmp_path / "a.gif"), {"emotion": ["笑"], "ocr_text": "哈哈", "aliases": [], "scene": [], "usable_for": []})
    store.upsert("h2", str(tmp_path / "b.gif"), {"failed": True, "ocr_text": "__unlabeled__", "emotion": [], "aliases": [], "scene": [], "usable_for": []})
    shelf = store.shelf(limit=5)
    assert [x["hash"] for x in shelf] == ["h1"]
    assert shelf[0]["caption"] == "哈哈"
    assert shelf[0]["score"] >= 2.0
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd server && .venv/bin/python -m pytest tests/test_sticker_store.py::test_short_caption_prefers_ocr tests/test_sticker_store.py::test_shelf_skips_unlabeled_and_respects_limit -v`  
Expected: FAIL（`short_caption` / `shelf` 未定义）

- [ ] **Step 3: Implement**

在 `sticker_store.py` 增加：

```python
def short_caption(tags: dict[str, Any] | None) -> str:
    tags = tags if isinstance(tags, dict) else {}
    ocr = str(tags.get("ocr_text") or "").strip()
    if ocr and ocr != _UNLABELED_OCR:
        return ocr[:24]
    for key in ("aliases", "emotion"):
        val = tags.get(key)
        if isinstance(val, list):
            for item in val:
                s = str(item).strip()
                if s:
                    return s[:24]
    return "表情"
```

`shelf`：复用 `pick_any` 的排序逻辑，但每项设置 `caption=short_caption(tags)`，并支持 `exclude_hashes`。若现有 `pick_any` 与 `shelf` 重复，让 `pick_any` 调用 `shelf`（或反过来）保持单一实现。

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd server && .venv/bin/python -m pytest tests/test_sticker_store.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/chat/media/sticker_store.py server/tests/test_sticker_store.py
git commit -m "$(cat <<'EOF'
feat(stickers): add shelf() and short_caption for labeled inventory

EOF
)"
```

---

### Task 2: Settings + panel keys for shelf

**Files:**
- Modify: `server/src/core/settings.py`
- Modify: `config/default.yaml`
- Modify: `utils/web-config-schema.js`（智能体 → sticker 组）

**Interfaces:**
- Produces settings fields:
  - `chat_sticker_shelf_enabled: bool` alias `CHAT_STICKER_SHELF_ENABLED` default `True`
  - `chat_sticker_shelf_size: int` alias `CHAT_STICKER_SHELF_SIZE` default `5`
- YAML keys: `chatStickerShelfEnabled`, `chatStickerShelfSize`
- `PANEL_KEY_MAP` / `web-config-schema` 同步

- [ ] **Step 1: Add fields to Settings + default.yaml**

```yaml
# config/default.yaml（表情包旁路附近）
chatStickerShelfEnabled: true
chatStickerShelfSize: 5
```

```python
# settings.py
chat_sticker_shelf_enabled: bool = Field(default=True, alias="CHAT_STICKER_SHELF_ENABLED")
chat_sticker_shelf_size: int = Field(default=5, alias="CHAT_STICKER_SHELF_SIZE")
# PANEL_KEY_MAP:
"chatStickerShelfEnabled": "chat_sticker_shelf_enabled",
"chatStickerShelfSize": "chat_sticker_shelf_size",
```

- [ ] **Step 2: Panel fields in web-config-schema.js**

```js
{
  key: 'chatStickerShelfEnabled',
  section: 'chat',
  group: 'sticker',
  groupLabel: '表情包旁路',
  label: '注入可发表情候选',
  type: 'switch',
  layout: 'row',
  help: '斗图倾向时给模型看货架；关则不发表情包',
},
{
  key: 'chatStickerShelfSize',
  section: 'chat',
  group: 'sticker',
  label: '候选条数',
  type: 'number',
  min: 1,
  max: 12,
},
```

- [ ] **Step 3: Smoke import**

Run: `cd server && .venv/bin/python -c "from src.core.settings import Settings; s=Settings(); assert s.chat_sticker_shelf_size==5"`  
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add server/src/core/settings.py config/default.yaml utils/web-config-schema.js
git commit -m "$(cat <<'EOF'
feat(config): add sticker shelf size/enabled settings

EOF
)"
```

---

### Task 3: Short-label rendering (segments + transcript)

**Files:**
- Modify: `server/src/chat/media/segments.py`
- Modify: `server/src/chat/transcript.py`
- Create: `server/tests/test_sticker_labels.py`

**Interfaces:**
- Produces:
  - `format_sticker_label(ref: MediaRef, *, tags: dict | None = None) -> str`  
    有 tags → `[表情包 {caption}｜{emotion1},{emotion2}]`；无 → `[表情包]` 或 `[表情包 未识别]`
  - `render_media_placeholders(refs, *, sticker_tags: dict[str, dict] | None = None)`  
    `sticker_tags` 以 url 或 hash 为键（实现选 **url** 更简单：ingest 后 path 未必回写到入站 message）
  - 过渡：无 tags 时仍输出 `[表情包]`（与现网兼容）

**说明：** 主线装配时用 store 按「本条/recent 里 sticker 的 url 是否已有同 hash 文件」较难；MVP 采用：  
`lookup_tags_for_ref(store, ref) -> dict|None`：若 `ref.path` 存在则按文件 sha 查；否则 `None`。入站当下常无 path——**允许首轮只显示 `[表情包]`，同 hash 再次出现或后续轮用 path/hash 增强**。若实现成本低，可在 ingest 成功后不要求回写 message。  
更优 MVP（推荐写进本任务）：`render` 时对 sticker 调用 `store.latest_caption_hint()` 不做；改为 **transcript/mainline 用 store.search 空？不行**。  
**定案：** `format_sticker_label(ref, tags=None)`；`enrich_refs_with_store(refs, store)`：对每个 sticker，若 store 能 `get` by hashing `ref.path` 文件，则挂 `ref.meta["tags"]`。无 path 则保持泛标签。验收 A1「可稍后看到标签」= 同图第二次或 bot 回写行带短名即可。

- [ ] **Step 1: Failing tests**

```python
# server/tests/test_sticker_labels.py
from src.chat.media.segments import MediaRef, format_sticker_label, render_media_placeholders

def test_format_labeled():
    ref = MediaRef(kind="sticker", url="https://x/a.gif")
    s = format_sticker_label(ref, tags={"ocr_text": "菜到安详", "emotion": ["自嘲", "摆烂"], "aliases": []})
    assert "菜到安详" in s and "自嘲" in s

def test_format_unlabeled():
    assert "表情包" in format_sticker_label(MediaRef(kind="sticker", url="u"))
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd server && .venv/bin/python -m pytest tests/test_sticker_labels.py -v`

- [ ] **Step 3: Implement format + wire render_media_placeholders**

```python
def format_sticker_label(ref: MediaRef, *, tags: dict | None = None) -> str:
    from src.chat.media.sticker_store import short_caption, _tags_labeled
    if tags and _tags_labeled(tags):
        cap = short_caption(tags)
        emos = [str(x).strip() for x in (tags.get("emotion") or []) if str(x).strip()][:2]
        if emos:
            return f"[表情包 {cap}｜{','.join(emos)}]"
        return f"[表情包 {cap}]"
    return "[表情包]"
```

更新 `render_media_placeholders`：sticker 分支调用 `format_sticker_label(ref, tags=ref.meta.get("tags"))`。

更新 `transcript_line`：对 sticker refs 用 `format_sticker_label` 取代裸 `[表情包]`（若 meta 无 tags 则仍为 `[表情包]`）。

- [ ] **Step 4: Tests PASS + 现有 segments 测试**

Run: `cd server && .venv/bin/python -m pytest tests/test_sticker_labels.py tests/test_media_segments.py -v`

- [ ] **Step 5: Commit**

```bash
git add server/src/chat/media/segments.py server/src/chat/transcript.py server/tests/test_sticker_labels.py
git commit -m "$(cat <<'EOF'
feat(stickers): render short labels for received stickers

EOF
)"
```

---

### Task 4: Build shelf candidates + inject into prompt

**Files:**
- Modify: `server/src/chat/mainline.py`（`_build_messages`、新增 helper）
- Test: `server/tests/test_sticker_reply.py`

**Interfaces:**
- Produces:
  - `dataclass` 或 TypedDict `ShelfItem`: `id: str`, `hash: str`, `path: str`, `caption: str`, `emotions: list[str]`
  - `build_sticker_shelf(store, settings, *, text: str, message, recent) -> list[ShelfItem]`  
    若 `not chat_sticker_shelf_enabled` 或 `not chat_sticker_reply_enabled` → `[]`  
    若 `not wants_dou_tu(...)` → `[]`  
    否则：`search(text)` 先填，再用 `shelf(exclude=...)` 补到 `chat_sticker_shelf_size`；id 分配 `s1..sK`
  - `format_shelf_prompt(items: list[ShelfItem]) -> str` — 规格 §6.2 文案
- `_build_messages`：若 shelf 非空，追加到 user_payload；把 `items` 存到某处供 resolve 使用（见 Task 5：`ml._turn_shelf` 或作为 `_generate` 局部变量传入 `resolve_sticker_bubbles`）

**推荐数据流（避免 GroupMainline 脏状态）：**  
在 `_generate` 内：`shelf_items = build_sticker_shelf(...)` → `_build_messages(..., shelf_items=shelf_items)` → `resolve_sticker_bubbles(..., shelf_items=shelf_items)`。

- [ ] **Step 1: Failing tests**

```python
def test_build_sticker_shelf_only_when_dou_tu():
    store = FakeStore(hits=[{"hash": "h1", "path": _OK_STICKER, "score": 3, "caption": "无奈", "tags": {"emotion": ["无奈"], "ocr_text": "无奈"}}])
    # 扩展 FakeStore.shelf / search 返回 caption
    items = build_sticker_shelf(store, Settings(chat_sticker_shelf_enabled=True), text="你好", message={}, recent=[])
    assert items == []
    items2 = build_sticker_shelf(store, Settings(chat_sticker_shelf_size=3), text="发个表情包", message={}, recent=[])
    assert len(items2) >= 1 and items2[0].id == "s1"
```

（需给 `FakeStore` 增加 `shelf()` 返回带 caption 的项。）

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `build_sticker_shelf` / `format_shelf_prompt`；改 `_build_messages` 签名接入**

删除或替换现有仅追加「可加 type:sticker query」的那段 Extra 为货架块（有货架时）。

- [ ] **Step 4: PASS**

Run: `cd server && .venv/bin/python -m pytest tests/test_sticker_reply.py -v`

- [ ] **Step 5: Commit**

```bash
git add server/src/chat/mainline.py server/tests/test_sticker_reply.py
git commit -m "$(cat <<'EOF'
feat(stickers): inject sticker shelf candidates into mainline prompt

EOF
)"
```

---

### Task 5: Resolve by `sticker.id` + strategy B（移除 auto pick）

**Files:**
- Modify: `server/src/chat/mainline.py` — `resolve_sticker_bubbles`
- Modify: `server/src/chat/llm.py` — `parse_replies_json` 保留 `id`
- Modify: `server/prompts/persona.md`
- Test: `server/tests/test_sticker_reply.py`

**Interfaces:**
- `resolve_sticker_bubbles(raw_bubbles, store, settings, *, shelf_items: list[ShelfItem], fallback_query: str = "")`  
  - **删除** `boost_dou_tu` 参数及末尾 `_try_add(..., allow_any=True)`  
  - `type==sticker`：`id=="none"` → 跳过；`id` 在 shelf 映射 → image；旧 `query` 仅在 **本轮 shelf_items** 的 caption/tags 上匹配，匹配不到 → 跳过（B）  
  - 非法 id → 跳过，不影响 text
- `parse_replies_json`：sticker 气泡保留 `id` 字段（及兼容 `query`）

- [ ] **Step 1: Rewrite failing/expected tests for B**

```python
def test_resolve_by_shelf_id():
    settings = Settings(chat_sticker_reply_enabled=True)
    items = [ShelfItem(id="s1", hash="h1", path=_OK_STICKER, caption="无奈", emotions=["无奈"])]
    out = resolve_sticker_bubbles(
        [{"type": "text", "text": "来"}, {"type": "sticker", "id": "s1"}],
        FakeStore(),
        settings,
        shelf_items=items,
    )
    assert any(r.type == "image" and r.path == _OK_STICKER for r in out)

def test_resolve_none_or_missing_does_not_auto_send():
    settings = Settings(chat_sticker_reply_enabled=True)
    items = [ShelfItem(id="s1", hash="h1", path=_OK_STICKER, caption="无奈", emotions=[])]
    out = resolve_sticker_bubbles(
        [{"type": "text", "text": "遵命这就发"}, {"type": "sticker", "id": "none"}],
        FakeStore(any_hits=[{"hash": "h1", "path": _OK_STICKER, "score": 9}]),
        settings,
        shelf_items=items,
    )
    assert all(r.type != "image" for r in out)

def test_resolve_omitted_sticker_no_boost_pick():
    # 仅文字 + 非空 shelf → 仍无 image（策略 B）
    ...
```

删除/改写旧的 `test_boost_dou_tu_auto_searches_when_llm_omits_sticker` 与 `test_loose_query_and_boost_pick_any_*`（若存在）：改为断言 **不**发图。

- [ ] **Step 2: Run — FAIL / 旧测试红**

- [ ] **Step 3: Implement resolve + persona**

`persona.md` 关键句改为：

```text
- 系统若提供【可发表情】列表：用 {"type":"sticker","id":"s1"} 选一张；没有合适用 "id":"none"
- 禁止说「发了」「给你整一个」却不选 id；货架为空时不要承诺发图
```

示例 JSON 增加 sticker 行说明。

- [ ] **Step 4: Full sticker reply tests PASS**

Run: `cd server && .venv/bin/python -m pytest tests/test_sticker_reply.py tests/test_sticker_store.py -v`  
Expected: 全绿

- [ ] **Step 5: Commit**

```bash
git add server/src/chat/mainline.py server/src/chat/llm.py server/prompts/persona.md server/tests/test_sticker_reply.py
git commit -m "$(cat <<'EOF'
feat(stickers): resolve shelf ids only; drop auto pick-any send (policy B)

EOF
)"
```

---

### Task 6: Archive「发了什么」to transcript / timeline

**Files:**
- Modify: `server/src/chat/mainline.py` — `_archive_bot`、timeline dump
- Modify: `server/src/chat/schema.py` 若 `ReplyBubble` 需可选 `sticker_desc: str | None = None`（或只用 path 反查 store）
- Test: `server/tests/test_sticker_labels.py` 或 `test_sticker_reply.py`

**Interfaces:**
- Resolve 出站 image 时设置 `bubble.sticker_desc = caption`（扩展 ReplyBubble）
- `_archive_bot`：

```python
parts = []
for r in replies:
    if r.type == "text" and r.text.strip():
        parts.append(r.text.strip())
    elif r.type == "image":
        desc = (getattr(r, "sticker_desc", None) or "").strip() or "表情"
        parts.append(f"[表情包 {desc}]")
if parts:
    append_transcript(group_id, "悠悠: " + " / ".join(parts))
```

- timeline `model_dump` 已含新字段即可。

- [ ] **Step 1: Test archive includes sticker desc**

```python
@pytest.mark.asyncio
async def test_generate_archives_sticker_desc(tmp_path, monkeypatch):
    # mock append_transcript 捕获参数；LLM 返回 sticker id；断言 line 含短名
    ...
```

- [ ] **Step 2–4: 实现 + PASS + Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(stickers): write sent sticker captions into transcript

EOF
)"
```

---

### Task 7: Ingest polish — mface with URL as sticker

**Files:**
- Modify: `server/src/chat/media/segments.py` — `_is_sticker` / mface 分支：有 http URL 时 `kind="sticker"`（或 ingest 把 mface 当 sticker 下载）
- Modify: `server/src/chat/media/ingest.py` — `_download_kinds` 已含 mface；确保 `kind=="sticker"` 才打标；若 mface 仍为 mface，改为：`if ref.kind in {"sticker", "mface"} and url` 走 sticker 目录+VLM
- Test: `server/tests/test_media_segments.py` / `test_media_download.py`

- [ ] **Step 1: Test mface with url classified for sticker pipeline**

```python
def test_mface_with_url_ingest_as_sticker_candidate():
    msg = {"message": [{"type": "mface", "url": "https://example/x.gif", "summary": "xx"}]}
    refs = parse_message_segments(msg)
    assert refs and refs[0].url.startswith("https://")
    # ingest 侧：kind 进入 sticker 打标路径（按你选的实现断言 kind 或 dest_dir）
```

- [ ] **Step 2–4: 实现使有 URL 的 mface 进入 files+VLM；无 URL 仍只占位**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(stickers): ingest mface with URL into sticker shelf pipeline

EOF
)"
```

---

### Task 8: Regression + manual checklist

**Files:** 无强制代码；更新 spec 状态为「实现中/完成」可选

- [ ] **Step 1: Full pytest media/sticker suite**

Run:

```bash
cd /opt/yunzai/plugins/yoyo-plugin/server && .venv/bin/python -m pytest \
  tests/test_sticker_store.py \
  tests/test_sticker_reply.py \
  tests/test_sticker_vlm.py \
  tests/test_sticker_labels.py \
  tests/test_media_segments.py \
  tests/test_media_download.py \
  tests/test_media_vision.py \
  -v
```

Expected: 全绿

- [ ] **Step 2: Restart Chat Brain**

群内 `#重启悠悠` 或等价重启 uvicorn，加载新代码。

- [ ] **Step 3: Manual A1–A7 on group `1129762204`**

| ID | 操作 | 期望 |
|----|------|------|
| A1 | 发动画表情 | `data/stickers/files` 增长且 index 有标签 |
| A2 | （断 vision）再发 | 不进货架；chat 文字正常 |
| A3 | `@悠悠 今天天气` | 回复无图；prompt 无货架（看 yoagent 日志/可选 debug） |
| A4 | `@悠悠 发个表情包` | 有图；transcript 有 `[表情包 …]` |
| A5 | 同场景但模型若 none | 仅文字、无图 |
| A6 | （单测已覆盖） | — |
| A7 | 纯表情 | skip；ingest 仍可能入库 |

- [ ] **Step 4: Commit spec status bump（可选）**

```bash
git add docs/superpowers/specs/2026-10-27-sticker-shelf-awareness-design.md
git commit -m "$(cat <<'EOF'
docs: mark sticker shelf awareness spec implemented

EOF
)"
```

---

## Spec coverage checklist

| Spec 节 | Task |
|---------|------|
| §4 入库 / VLM vision / 失败不进货架 | 已有 ingest+vlm；Task 7 mface；Task 1 shelf 过滤 |
| §5 短标签感知 | Task 3 |
| §6 候选注入 | Task 4 |
| §6.4 策略 B | Task 5 |
| §7 发出 + 回写 | Task 5–6 |
| §8 配置 | Task 2 |
| §9 删除 boost pick_any | Task 5 |
| A1–A7 | Task 8 |

## Placeholder / consistency notes

- `ShelfItem` 名称在 Task 4/5 保持一致。  
- `resolve_sticker_bubbles` 新签名以 `shelf_items` 为准，不再使用 `boost_dou_tu`。  
- `pick_any` 可保留给 `shelf` 补齐，**禁止**在 resolve 出站路径调用。
