# Hero Look + Draw Ref Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a decoupled `look` tool that resolves local hero portraits via Node’s `getHeroImgs` index, returns appearance `desc` + `ref_available` to the persona (never raw paths), and lets optional `draw.use_ref` mount the last look image as edit sources when the user sent no photo.

**Architecture:** Node `getHeroImgs()` writes `data/cache/hero_imgs.json` (id → abs paths). Python `hero_look` reads that index, resolves `q` via game_kb + `chatGameSelfHeroId`, copies one image into `server/data/media/looks/`, stores `{hero_id,name,path,ts}` on `GroupMainline.pending_look_ref`, and injects a【工具结果】blob in the same sync two-phase path as lookup. `draw` gains `use_ref`; user photos still win.

**Tech Stack:** Node (Yunzai plugin `utils/game.js`), Python 3.12, existing `mainline._follow_declared_tools` / `parse_persona_json` / vision `complete`, pytest, Settings + YAML + web-config-schema.

**Spec:** [`docs/superpowers/specs/2026-10-28-hero-look-draw-ref-design.md`](../specs/2026-10-28-hero-look-draw-ref-design.md)

## Global Constraints

- **Do not** put absolute paths, base64, or long URLs in【工具结果】/ persona-visible tool JSON.
- **Do not** auto-draw after look; look ≠ draw.
- Node `getHeroImgs` / `getHeroId` remain the image-index truth; Python must not re-scan `resources/img/hero` with a second `getHeroId`.
- User message photos always beat `pending_look_ref` when both exist.
- VLM failure must not block look: `ref_available` stays true if a file was copied.
- look and lookup **separate** per-turn caps (`chatHeroLookMaxPerTurn` vs `chatGameLookupMax`).
- look / draw / sticker / lookup do **not** consume `max_replies` text budget.
- Out of scope: pet/item looks, multi-ref collage, MEMORY write of look, replacing user uploads.

## File map

| File | Responsibility |
|------|----------------|
| `utils/game.js` | After building `heroImgs`, write `data/cache/hero_imgs.json` |
| `server/src/chat/hero_look/paths.py` | Plugin root, index path, looks media dir |
| `server/src/chat/hero_look/index.py` | Load index; pick random image path for hero id |
| `server/src/chat/hero_look/resolve_q.py` | `q` / self / id → `(hero_id, name)` via game_kb |
| `server/src/chat/hero_look/describe.py` | Weak card desc + optional VLM ≤200 chars |
| `server/src/chat/hero_look/run.py` | `run_look` / `run_looks` → tool blob + pending ref payload |
| `server/src/chat/hero_look/__init__.py` | Public exports |
| `server/src/chat/llm.py` | Parse `look` + `draw.use_ref` |
| `server/src/chat/mainline.py` | `pending_look_ref`; look in `_follow_declared_tools`; strip; draw sources |
| `server/src/core/settings.py` + `config/default.yaml` + `utils/web-config-schema.js` | Flags |
| `server/prompts/persona.md` + `help_capabilities.py` | Tool face copy |
| `docs/12-game-knowledge.md` (or short § in docs) | Index note for ops |
| `server/tests/test_hero_look_*.py` | Unit + two-phase wiring |

---

### Task 1: Node hero image index + Python loader/picker

**Files:**
- Modify: `utils/game.js` (`getHeroImgs`)
- Create: `server/src/chat/hero_look/paths.py`
- Create: `server/src/chat/hero_look/index.py`
- Create: `server/src/chat/hero_look/__init__.py` (stub exports)
- Test: `server/tests/test_hero_look_index.py`

**Interfaces:**
- Produces: `hero_imgs_index_path() -> Path`; `load_hero_img_index() -> dict[str, list[str]]`; `pick_hero_img(hero_id: str, *, rng=None) -> str | None` (abs path, image suffix only).
- Node writes JSON shape: `{ "101003": ["/abs/a.png", ...], ... }` (string keys, array of absolute paths).

- [ ] **Step 1: Write failing tests**

```python
# server/tests/test_hero_look_index.py
import json
from pathlib import Path

from src.chat.hero_look.index import load_hero_img_index, pick_hero_img
from src.chat.hero_look.paths import hero_imgs_index_path


def test_index_path_under_data_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "src.chat.hero_look.paths._PLUGIN_ROOT",
        tmp_path,
    )
    p = hero_imgs_index_path()
    assert p == tmp_path / "data" / "cache" / "hero_imgs.json"


def test_pick_filters_non_images_and_missing(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.hero_look.paths._PLUGIN_ROOT", tmp_path)
    img = tmp_path / "a.png"
    img.write_bytes(b"x")
    junk = tmp_path / "notes.txt"
    junk.write_text("nope", encoding="utf-8")
    index_path = tmp_path / "data" / "cache" / "hero_imgs.json"
    index_path.parent.mkdir(parents=True)
    index_path.write_text(
        json.dumps({"101003": [str(junk), str(img), str(tmp_path / "gone.jpg")]}),
        encoding="utf-8",
    )
    assert load_hero_img_index()["101003"]
    picked = pick_hero_img("101003", rng=_Fixed(0))
    assert picked == str(img)
    assert pick_hero_img("999999") is None


class _Fixed:
    def choice(self, seq):
        return seq[0]
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd /opt/yunzai/plugins/yoyo-plugin/server && uv run pytest tests/test_hero_look_index.py -q`

Expected: import / path errors.

- [ ] **Step 3: Implement paths + index**

```python
# server/src/chat/hero_look/paths.py
from pathlib import Path

_PLUGIN_ROOT = Path(__file__).resolve().parents[4]  # .../yoyo-plugin
_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def plugin_root() -> Path:
    return _PLUGIN_ROOT


def hero_imgs_index_path() -> Path:
    return _PLUGIN_ROOT / "data" / "cache" / "hero_imgs.json"


def looks_media_dir(session_id: str = "") -> Path:
    base = _PLUGIN_ROOT / "server" / "data" / "media" / "looks"
    if session_id:
        safe = "".join(c if c.isalnum() or c in "-_:" else "_" for c in session_id)[:80]
        return base / safe
    return base
```

```python
# server/src/chat/hero_look/index.py
from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any

from src.chat.hero_look.paths import _IMAGE_SUFFIXES, hero_imgs_index_path


def load_hero_img_index() -> dict[str, list[str]]:
    path = hero_imgs_index_path()
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    out: dict[str, list[str]] = {}
    for k, v in data.items():
        if isinstance(v, list):
            out[str(k)] = [str(x) for x in v if str(x).strip()]
    return out


def _usable(paths: list[str]) -> list[str]:
    ok: list[str] = []
    for raw in paths:
        p = Path(raw)
        if p.suffix.lower() not in _IMAGE_SUFFIXES:
            continue
        if p.is_file():
            ok.append(str(p.resolve()))
    return ok


def pick_hero_img(hero_id: str, *, rng: Any = None) -> str | None:
    paths = _usable(load_hero_img_index().get(str(hero_id), []))
    if not paths:
        return None
    chooser = rng if rng is not None else random
    return chooser.choice(paths)
```

```python
# server/src/chat/hero_look/__init__.py
# filled in later tasks
__all__: list[str] = []
```

- [ ] **Step 4: Patch Node `getHeroImgs` to write the index**

In `utils/game.js`, at end of `getHeroImgs()` (after the forEach loops that fill `this.heroImgs`), write:

```javascript
    // Chat Brain look 工具：Python 只读此索引，不复刻 getHeroId
    try {
      const indexPath = path.join(setting.path, 'data/cache/hero_imgs.json')
      fs.mkdirSync(path.dirname(indexPath), { recursive: true })
      fs.writeFileSync(indexPath, JSON.stringify(this.heroImgs || {}), 'utf8')
    } catch (e) {
      logger?.warn?.(`[yoyo-plugin][game] write hero_imgs index failed: ${e}`)
    }
```

Also call the same write (or `await this.getHeroImgs()`) wherever hero images are mutated so the index stays fresh (existing add/remove paths that already touch `this.heroImgs` — after those mutations, rewrite index the same way, or extract `_writeHeroImgsIndex()` and call it).

- [ ] **Step 5: Regenerate index once for local tests**

From plugin root (Node available in Yunzai env), either restart Yunzai / run a one-shot that imports game and calls `getHeroImgs`, **or** manually seed a tiny fixture JSON under `data/cache/hero_imgs.json` for unit tests only (tests use monkeypatch + tmp_path).

- [ ] **Step 6: Run tests — expect PASS**

Run: `cd /opt/yunzai/plugins/yoyo-plugin/server && uv run pytest tests/test_hero_look_index.py -q`

- [ ] **Step 7: Commit**

```bash
git add utils/game.js server/src/chat/hero_look server/tests/test_hero_look_index.py
git commit -m "$(cat <<'EOF'
feat(hero-look): export Node hero_imgs index for Chat look tool

EOF
)"
```

---

### Task 2: Resolve `q` + `run_look` (copy ref, weak desc, tool JSON)

**Files:**
- Create: `server/src/chat/hero_look/resolve_q.py`
- Create: `server/src/chat/hero_look/describe.py` (weak + sync stub; VLM wired in Task 3)
- Create: `server/src/chat/hero_look/run.py`
- Modify: `server/src/chat/hero_look/__init__.py`
- Test: `server/tests/test_hero_look_run.py`

**Interfaces:**
- Consumes: `pick_hero_img`, `get_record("hero", id)` / `resolve_name` from game_kb, `chat_game_self_hero_id`.
- Produces:
  - `resolve_look_query(q: str, *, self_hero_id: str) -> tuple[str, str] | None` → `(hero_id, name)`
  - `weak_desc(hero_id: str, name: str) -> str`
  - `run_look(op: dict, *, self_hero_id: str, session_id: str = "", describe=None) -> tuple[dict, dict | None]`
    - first: public tool result dict (no path)
    - second: `pending_look_ref` or `None`
  - `format_look_blob(results: list[dict]) -> str` → `【工具结果】\n` + JSON lines
  - `run_looks(ops, *, self_hero_id, session_id, max_ops, describe=None) -> tuple[str, dict | None, list[dict]]`
    - `(blob, pending_ref, results)` — `results` so mainline can overwrite `desc` after VLM

- [ ] **Step 1: Write failing tests**

```python
# server/tests/test_hero_look_run.py
import json
from pathlib import Path

from src.chat.hero_look.resolve_q import resolve_look_query
from src.chat.hero_look.run import run_look, run_looks


def test_resolve_self_and_empty(monkeypatch):
    monkeypatch.setattr(
        "src.chat.hero_look.resolve_q.get_record",
        lambda kind, eid: {"id": eid, "name": "寒悠悠"} if eid == "101003" else None,
    )
    assert resolve_look_query("self", self_hero_id="101003") == ("101003", "寒悠悠")
    assert resolve_look_query("", self_hero_id="101003") == ("101003", "寒悠悠")


def test_resolve_by_name(monkeypatch):
    monkeypatch.setattr(
        "src.chat.hero_look.resolve_q.resolve_name",
        lambda q: [("hero", "101003")] if q == "寒悠悠" else [],
    )
    monkeypatch.setattr(
        "src.chat.hero_look.resolve_q.get_record",
        lambda kind, eid: {"id": "101003", "name": "寒悠悠"},
    )
    assert resolve_look_query("寒悠悠", self_hero_id="101003")[0] == "101003"


def test_run_look_ok_no_path_in_result(tmp_path, monkeypatch):
    img = tmp_path / "h.png"
    img.write_bytes(b"png")
    monkeypatch.setattr("src.chat.hero_look.paths._PLUGIN_ROOT", tmp_path)
    monkeypatch.setattr(
        "src.chat.hero_look.run.resolve_look_query",
        lambda q, self_hero_id="101003": ("101003", "寒悠悠"),
    )
    monkeypatch.setattr("src.chat.hero_look.run.pick_hero_img", lambda hid, **kw: str(img))
    monkeypatch.setattr(
        "src.chat.hero_look.run.weak_desc",
        lambda hid, name: f"{name} 短描述",
    )
    result, pending = run_look({"type": "look", "q": "self"}, self_hero_id="101003", session_id="g1")
    assert result["ok"] is True
    assert result["ref_available"] is True
    assert result["kind"] == "hero_look"
    assert "path" not in result
    blob = json.dumps(result, ensure_ascii=False)
    assert str(img) not in blob
    assert pending is not None
    assert Path(pending["path"]).is_file()
    assert pending["hero_id"] == "101003"


def test_run_look_resolve_miss(monkeypatch):
    monkeypatch.setattr(
        "src.chat.hero_look.run.resolve_look_query",
        lambda q, self_hero_id="101003": None,
    )
    result, pending = run_look({"type": "look", "q": "不存在"}, self_hero_id="101003")
    assert result["ok"] is False
    assert result["ref_available"] is False
    assert pending is None


def test_run_look_no_local_img(monkeypatch):
    monkeypatch.setattr(
        "src.chat.hero_look.run.resolve_look_query",
        lambda q, self_hero_id="101003": ("101003", "寒悠悠"),
    )
    monkeypatch.setattr("src.chat.hero_look.run.pick_hero_img", lambda hid, **kw: None)
    result, pending = run_look({"type": "look", "q": "self"}, self_hero_id="101003")
    assert result["ok"] is False
    assert result["id"] == "101003"
    assert result["ref_available"] is False
    assert pending is None
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd /opt/yunzai/plugins/yoyo-plugin/server && uv run pytest tests/test_hero_look_run.py -q`

- [ ] **Step 3: Implement resolve + weak_desc + run**

```python
# server/src/chat/hero_look/resolve_q.py
from __future__ import annotations

from src.chat.game_kb.resolve import get_record, resolve_name


def resolve_look_query(q: str, *, self_hero_id: str) -> tuple[str, str] | None:
    raw = (q or "").strip()
    self_id = str(self_hero_id or "101003").strip() or "101003"
    if not raw or raw.lower() == "self":
        rec = get_record("hero", self_id) or {}
        name = str(rec.get("name") or self_id)
        return self_id, name
    if raw.isdigit() or (len(raw) >= 4 and raw[:1].isdigit()):
        rec = get_record("hero", raw)
        if rec:
            return str(rec.get("id") or raw), str(rec.get("name") or raw)
    for kind, eid in resolve_name(raw):
        if kind == "hero":
            rec = get_record("hero", eid) or {}
            return str(eid), str(rec.get("name") or raw)
    rec = get_record("hero", raw)
    if rec:
        return str(rec.get("id") or raw), str(rec.get("name") or raw)
    return None
```

```python
# server/src/chat/hero_look/describe.py
from __future__ import annotations

from src.chat.game_kb.resolve import get_record

_HINT_OK = (
    '若要按此角色长相画画：replies 加 {"type":"draw","prompt":"场景与画风","use_ref":true}；'
    "不要空口编五官。"
)
_HINT_MISS = "本地没有该角色立绘；可换名字或引导用户发图当参考。"


def weak_desc(hero_id: str, name: str) -> str:
    rec = get_record("hero", hero_id) or {}
    bits = [name or str(rec.get("name") or hero_id)]
    for key in ("race", "element", "elements", "profession"):
        val = rec.get(key)
        if val in (None, "", []):
            continue
        if isinstance(val, list):
            bits.append("、".join(str(x) for x in val if x not in (None, "")))
        else:
            bits.append(str(val))
    body = "，".join(b for b in bits if b)
    return f"{body}。外貌以参考立绘为准，勿编造未给出的五官细节。"[:200]


def hint_ok() -> str:
    return _HINT_OK


def hint_miss() -> str:
    return _HINT_MISS
```

```python
# server/src/chat/hero_look/run.py
from __future__ import annotations

import json
import shutil
import time
from pathlib import Path
from typing import Any, Callable

from src.chat.hero_look.describe import hint_miss, hint_ok, weak_desc
from src.chat.hero_look.index import pick_hero_img
from src.chat.hero_look.paths import looks_media_dir
from src.chat.hero_look.resolve_q import resolve_look_query

DescribeFn = Callable[[Path, str, str], str]  # (copied_path, hero_id, name) -> desc


def _miss(**extra: Any) -> dict[str, Any]:
    return {
        "ok": False,
        "kind": "hero_look",
        "id": "",
        "name": "",
        "desc": "",
        "ref_available": False,
        "hint": hint_miss(),
        **extra,
    }


def run_look(
    op: dict[str, Any],
    *,
    self_hero_id: str,
    session_id: str = "",
    describe: DescribeFn | None = None,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    q = str((op or {}).get("q") or (op or {}).get("query") or "").strip()
    resolved = resolve_look_query(q, self_hero_id=self_hero_id)
    if not resolved:
        return _miss(), None
    hero_id, name = resolved
    src = pick_hero_img(hero_id)
    if not src:
        bad = _miss()
        bad["id"] = hero_id
        bad["name"] = name
        return bad, None
    dest_dir = looks_media_dir(session_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(src).suffix.lower() or ".png"
    dest = dest_dir / f"{hero_id}{suffix}"
    shutil.copy2(src, dest)
    if describe is not None:
        desc = (describe(dest, hero_id, name) or "").strip()[:200]
    else:
        desc = weak_desc(hero_id, name)
    if not desc:
        desc = weak_desc(hero_id, name)
    result = {
        "ok": True,
        "kind": "hero_look",
        "id": hero_id,
        "name": name,
        "desc": desc[:200],
        "ref_available": True,
        "hint": hint_ok(),
    }
    pending = {
        "hero_id": hero_id,
        "name": name,
        "path": str(dest.resolve()),
        "ts": time.time(),
    }
    return result, pending


def format_look_blob(results: list[dict[str, Any]]) -> str:
    lines = [json.dumps(r, ensure_ascii=False) for r in results]
    return "【工具结果】\n" + "\n".join(lines)


def run_looks(
    ops: list[dict[str, Any]],
    *,
    self_hero_id: str,
    session_id: str = "",
    max_ops: int = 1,
    describe: DescribeFn | None = None,
) -> tuple[str, dict[str, Any] | None, list[dict[str, Any]]]:
    limit = max(0, int(max_ops or 0))
    results: list[dict[str, Any]] = []
    pending: dict[str, Any] | None = None
    for op in ops[:limit]:
        if not isinstance(op, dict) or op.get("type") != "look":
            continue
        result, ref = run_look(
            op, self_hero_id=self_hero_id, session_id=session_id, describe=describe
        )
        results.append(result)
        if ref:
            pending = ref
    if not results:
        return "", None, []
    return format_look_blob(results), pending, results
```

Update `__init__.py`:

```python
from src.chat.hero_look.run import run_look, run_looks

__all__ = ["run_look", "run_looks"]
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd /opt/yunzai/plugins/yoyo-plugin/server && uv run pytest tests/test_hero_look_run.py -q`

- [ ] **Step 5: Commit**

```bash
git add server/src/chat/hero_look server/tests/test_hero_look_run.py
git commit -m "$(cat <<'EOF'
feat(hero-look): resolve query, copy ref, emit tool result without paths

EOF
)"
```

---

### Task 3: Optional VLM appearance desc

**Files:**
- Modify: `server/src/chat/hero_look/describe.py`
- Test: `server/tests/test_hero_look_describe.py`

**Interfaces:**
- Produces: `async def vlm_desc(settings, image_path: Path, *, hero_id: str, name: str) -> str | None`
- Fallback: on any failure return `None` (caller uses `weak_desc`).

- [ ] **Step 1: Write failing test**

```python
# server/tests/test_hero_look_describe.py
import pytest
from pathlib import Path

from src.chat.hero_look.describe import vlm_desc
from src.core.settings import Settings


@pytest.mark.asyncio
async def test_vlm_desc_returns_none_when_unconfigured(tmp_path):
    img = tmp_path / "a.png"
    img.write_bytes(b"x")
    settings = Settings(llm_api_key="", chat_vision_api_key="", chat_vision_model="")
    assert await vlm_desc(settings, img, hero_id="101003", name="寒悠悠") is None
```

- [ ] **Step 2: Run — expect FAIL (missing symbol)**

Run: `cd /opt/yunzai/plugins/yoyo-plugin/server && uv run pytest tests/test_hero_look_describe.py -q`

- [ ] **Step 3: Implement VLM (mirror `sticker_vlm.py`)**

```python
# append to describe.py
import base64
import logging
from pathlib import Path

from src.chat.llm import complete
from src.core.settings import Settings

_logger = logging.getLogger("yoyo.chat.hero_look.describe")
_MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
         ".gif": "image/gif", ".webp": "image/webp"}
_VLM_SYSTEM = (
    "只输出不超过200字的中文外貌要点：发色发型、五官气质、服装配色；"
    "禁止数值/技能/剧情剧透；不要输出 JSON。"
)


async def vlm_desc(
    settings: Settings, image_path: Path, *, hero_id: str, name: str
) -> str | None:
    path = Path(image_path)
    if not path.is_file():
        return None
    call = settings.profile("vision")
    if not call.llm_configured:
        return None
    try:
        raw = path.read_bytes()
    except OSError:
        return None
    if not raw:
        return None
    b64 = base64.b64encode(raw).decode("ascii")
    mime = _MIME.get(path.suffix.lower(), "image/png")
    messages = [
        {"role": "system", "content": _VLM_SYSTEM},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": f"描述角色「{name}」(id={hero_id}) 立绘外观"},
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
            ],
        },
    ]
    try:
        content = await complete(messages, call)
    except Exception:
        _logger.warning("hero look vlm failed path=%s", path, exc_info=True)
        return None
    text = (content or "").strip().replace("\n", " ")
    return text[:200] or None
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd /opt/yunzai/plugins/yoyo-plugin/server && uv run pytest tests/test_hero_look_describe.py -q`

- [ ] **Step 5: Commit**

```bash
git add server/src/chat/hero_look/describe.py server/tests/test_hero_look_describe.py
git commit -m "$(cat <<'EOF'
feat(hero-look): optional VLM appearance desc with weak fallback

EOF
)"
```

---

### Task 4: Parse `look` + `draw.use_ref` + settings/config

**Files:**
- Modify: `server/src/chat/llm.py` (`parse_persona_json`)
- Modify: `server/src/core/settings.py` (fields + YAML maps)
- Modify: `config/default.yaml`
- Modify: `utils/web-config-schema.js`
- Test: `server/tests/test_hero_look_parse.py`

**Interfaces:**
- `look` bubble: `{"type":"look","q": str}` — does not increment `text_or_image`.
- `draw` bubble may include `"use_ref": true` (bool).
- Settings: `chat_hero_look_enabled: bool = True`, `chat_hero_look_max_per_turn: int = 1`  
  YAML: `chatHeroLookEnabled`, `chatHeroLookMaxPerTurn`  
  (reuse existing `chatGameSelfHeroId` / `chat_game_self_hero_id`).

- [ ] **Step 1: Write failing parse tests**

```python
# server/tests/test_hero_look_parse.py
from src.chat.llm import parse_persona_json


def test_parse_look_and_draw_use_ref():
    raw = '''{"engagement":"hold","replies":[
      {"type":"look","q":"self"},
      {"type":"text","text":"稍等"},
      {"type":"draw","prompt":"赛博街头","use_ref":true}
    ]}'''
    bubbles, eng = parse_persona_json(raw, max_replies=1)
    assert eng == "hold"
    look = next(b for b in bubbles if b["type"] == "look")
    assert look["q"] == "self"
    draw = next(b for b in bubbles if b["type"] == "draw")
    assert draw["use_ref"] is True
    assert draw["prompt"] == "赛博街头"
    assert sum(1 for b in bubbles if b["type"] == "text") == 1


def test_look_does_not_eat_text_budget():
    raw = '''{"engagement":"hold","replies":[
      {"type":"look","q":"寒悠悠"},
      {"type":"text","text":"一"},
      {"type":"text","text":"二"}
    ]}'''
    bubbles, _ = parse_persona_json(raw, max_replies=1)
    assert any(b["type"] == "look" for b in bubbles)
    texts = [b for b in bubbles if b["type"] == "text"]
    assert len(texts) == 1
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd /opt/yunzai/plugins/yoyo-plugin/server && uv run pytest tests/test_hero_look_parse.py -q`

- [ ] **Step 3: Patch `parse_persona_json`**

After the `expand` branch (before `web_search`), add:

```python
        if typ == "look":
            out.append(
                {
                    "type": "look",
                    "q": str(item.get("q") or item.get("query") or item.get("text") or "").strip(),
                }
            )
            continue
```

In the `draw` branch, after building `bubble`, add:

```python
            if item.get("use_ref") is True or str(item.get("use_ref") or "").strip().lower() in {
                "1",
                "true",
                "yes",
            }:
                bubble["use_ref"] = True
```

- [ ] **Step 4: Settings + YAML + web schema**

In `Settings`:

```python
    chat_hero_look_enabled: bool = Field(default=True, alias="CHAT_HERO_LOOK_ENABLED")
    chat_hero_look_max_per_turn: int = Field(default=1, alias="CHAT_HERO_LOOK_MAX_PER_TURN")
```

In `apply_yaml_overrides` / maps:
- `_YAML_BOOL`: `"chatHeroLookEnabled": "chat_hero_look_enabled"`
- `_YAML_INT`: `"chatHeroLookMaxPerTurn": "chat_hero_look_max_per_turn"`

`config/default.yaml` (near game kb):

```yaml
chatHeroLookEnabled: true
chatHeroLookMaxPerTurn: 1
```

`utils/web-config-schema.js` — add two entries in `gameKb` group (or new `heroLook` group under chat): switch + number (min 0 max 4).

- [ ] **Step 5: Run parse tests — PASS**

Run: `cd /opt/yunzai/plugins/yoyo-plugin/server && uv run pytest tests/test_hero_look_parse.py -q`

- [ ] **Step 6: Commit**

```bash
git add server/src/chat/llm.py server/src/core/settings.py config/default.yaml utils/web-config-schema.js server/tests/test_hero_look_parse.py
git commit -m "$(cat <<'EOF'
feat(hero-look): parse look bubbles and draw.use_ref; add config flags

EOF
)"
```

---

### Task 5: Mainline wiring (two-phase look + draw sources)

**Files:**
- Modify: `server/src/chat/mainline.py`
- Test: `server/tests/test_hero_look_twophase.py`

**Interfaces:**
- `GroupMainline.pending_look_ref: dict | None = None`
- `_look_limit() -> int` from `chat_hero_look_max_per_turn`
- In `_follow_declared_tools`: if `chat_hero_look_enabled`, collect `type=="look"` ops (cap), `await`/`to_thread` `run_looks`, append blob to `parts`, set `ml.pending_look_ref` when ref returned; use VLM describe when vision configured (async wrapper).
- Second-pass user nudge: also say不要重复同一 look（alongside lookup/web_search）.
- Strip `look` with lookup/web tools before draw.
- Draw path: compute `user_srcs = self._draw_sources(req)`; if `user_srcs`: use them; elif `draw_req.get("use_ref")` and `ml.pending_look_ref` with existing path: `sources=[path]` and clear `pending_look_ref`; else `sources=user_srcs` (empty → generate).
- Trace event: `hero_look`.

- [ ] **Step 1: Write failing two-phase test**

```python
# server/tests/test_hero_look_twophase.py
import asyncio
import uuid
from pathlib import Path

import pytest

from src.chat.mainline import MainlineManager, reset_mainline_manager_for_tests
from src.chat.schema import ChatHints, ChatRequest, SessionInfo
from src.core.settings import Settings


def _settings(**overrides) -> Settings:
    base = dict(
        chat_hero_look_enabled=True,
        chat_hero_look_max_per_turn=1,
        chat_game_kb_enabled=True,
        chat_game_self_hero_id="101003",
        chat_memory_enabled=False,
        chat_sticker_reply_enabled=False,
        chat_heat_enabled=False,
        chat_heat_debounce_sec=0.05,
        llm_api_key="x",
        proactive_enabled=True,
        tools_enabled=True,
        chat_draw_model="mock-draw",
        draw_mock_delay_sec=0.05,
    )
    base.update(overrides)
    return Settings(**base)


def _req(text: str = "你长什么样"):
    gid = f"hl{uuid.uuid4().hex[:8]}"
    sid = f"group:{gid}:bot:2"
    req = ChatRequest(
        request_id=gid,
        session=SessionInfo(session_id=sid, group_id=gid, bot_id="2"),
        message={
            "user_id": "1",
            "sender": {"nickname": "t"},
            "message": [{"type": "text", "text": text}],
            "raw_message": text,
        },
        recent=[],
        hints=ChatHints(at_bot=True, wake_word=False, reply_to_bot=False),
    )
    return sid, req


async def _await_outbox(mgr, sid, timeout=3.0):
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        pending = mgr.drain_pending(sid)
        if pending and pending.action == "reply" and pending.replies:
            return pending
        await asyncio.sleep(0.05)
    return None


@pytest.mark.asyncio
async def test_look_then_text_no_auto_draw(tmp_path, monkeypatch):
    img = tmp_path / "h.png"
    img.write_bytes(b"png")
    index = tmp_path / "data" / "cache" / "hero_imgs.json"
    index.parent.mkdir(parents=True)
    index.write_text('{"101003": ["' + str(img).replace('\\\\', '/') + '"]}', encoding="utf-8")
    monkeypatch.setattr("src.chat.hero_look.paths._PLUGIN_ROOT", tmp_path)
    monkeypatch.setattr(
        "src.chat.hero_look.resolve_q.get_record",
        lambda kind, eid: {"id": "101003", "name": "寒悠悠"} if eid == "101003" else None,
    )

    calls = {"n": 0}

    async def fake_llm(messages, settings, *, abort_event=None):
        calls["n"] += 1
        content = str(messages[-1].get("content") or "")
        if calls["n"] == 1:
            return '{"engagement":"hold","replies":[{"type":"look","q":"self"}]}'
        assert "【工具结果】" in content
        assert "hero_look" in content
        assert str(img) not in content
        return '{"engagement":"hold","replies":[{"type":"text","text":"白发红瞳啦"}]}'

    mgr = reset_mainline_manager_for_tests(
        MainlineManager(settings=_settings(), llm_complete=fake_llm)
    )
    sid, req = _req()
    try:
        await mgr.handle(req)
        out = await _await_outbox(mgr, sid)
        assert out is not None
        assert out.replies[0].text == "白发红瞳啦"
        assert calls["n"] == 2
        ml = mgr.get(sid)
        assert ml.pending_look_ref is not None
        assert Path(ml.pending_look_ref["path"]).is_file()
    finally:
        reset_mainline_manager_for_tests()


@pytest.mark.asyncio
async def test_draw_use_ref_uses_pending_when_no_user_photo(tmp_path, monkeypatch):
    img = tmp_path / "h.png"
    img.write_bytes(b"png")
    index = tmp_path / "data" / "cache" / "hero_imgs.json"
    index.parent.mkdir(parents=True)
    index.write_text(
        json.dumps({"101003": [str(img)]}),
        encoding="utf-8",
    )
    monkeypatch.setattr("src.chat.hero_look.paths._PLUGIN_ROOT", tmp_path)
    monkeypatch.setattr(
        "src.chat.hero_look.resolve_q.get_record",
        lambda kind, eid: {"id": "101003", "name": "寒悠悠"} if eid == "101003" else None,
    )

    calls = {"n": 0}

    async def fake_llm(messages, settings, *, abort_event=None):
        calls["n"] += 1
        if calls["n"] == 1:
            return '{"engagement":"hold","replies":[{"type":"look","q":"self"}]}'
        return (
            '{"engagement":"hold","replies":['
            '{"type":"text","text":"稍等"},'
            '{"type":"draw","prompt":"赛博街头","use_ref":true}]}'
        )

    mgr = reset_mainline_manager_for_tests(
        MainlineManager(settings=_settings(), llm_complete=fake_llm)
    )
    sid, req = _req("画一张你")
    try:
        await mgr.handle(req)
        out = await _await_outbox(mgr, sid)
        assert out is not None
        ml = mgr.get(sid)
        assert ml.jobs, "expected draw job"
        job = ml.jobs[-1]
        assert job.get("mode") == "edit"
        assert any(str(img.name) in str(s) or "101003" in str(s) for s in (job.get("sources") or []))
        assert ml.pending_look_ref is None
    finally:
        for task in list(mgr.get(sid).job_tasks.values()):
            if task and not task.done():
                task.cancel()
        reset_mainline_manager_for_tests()


@pytest.mark.asyncio
async def test_user_photo_beats_look_ref(tmp_path, monkeypatch):
    look_img = tmp_path / "look.png"
    look_img.write_bytes(b"png")
    user_img = tmp_path / "user.jpg"
    user_img.write_bytes(b"jpg")
    monkeypatch.setattr("src.chat.hero_look.paths._PLUGIN_ROOT", tmp_path)

    async def fake_llm(messages, settings, *, abort_event=None):
        return (
            '{"engagement":"hold","replies":['
            '{"type":"draw","prompt":"改成赛博","use_ref":true}]}'
        )

    mgr = reset_mainline_manager_for_tests(
        MainlineManager(settings=_settings(), llm_complete=fake_llm)
    )
    sid, req = _req("按这个改")
    req.message["message"] = [
        {"type": "text", "text": "按这个改"},
        {"type": "image", "url": str(user_img), "path": str(user_img)},
    ]
    ml = mgr.get(sid)
    ml.pending_look_ref = {
        "hero_id": "101003",
        "name": "寒悠悠",
        "path": str(look_img),
        "ts": 1.0,
    }
    try:
        await mgr.handle(req)
        out = await _await_outbox(mgr, sid)
        assert out is not None
        job = mgr.get(sid).jobs[-1]
        srcs = [str(s) for s in (job.get("sources") or [])]
        assert any("user.jpg" in s for s in srcs)
        assert not any("look.png" in s for s in srcs)
    finally:
        for task in list(mgr.get(sid).job_tasks.values()):
            if task and not task.done():
                task.cancel()
        reset_mainline_manager_for_tests()
```

Add `import json` at top of the test file.

- [ ] **Step 2: Run — expect FAIL**

Run: `cd /opt/yunzai/plugins/yoyo-plugin/server && uv run pytest tests/test_hero_look_twophase.py -q`

- [ ] **Step 3: Wire mainline**

1. On `GroupMainline`:

```python
    pending_look_ref: dict[str, Any] | None = None
```

2. Add `_look_limit` analogous to `_lookup_limit`.

3. In `_follow_declared_tools`, after the game lookup block, add:

```python
        if getattr(self.settings, "chat_hero_look_enabled", True):
            look_max = self._look_limit()
            look_ops = [
                b for b in bubbles if isinstance(b, dict) and b.get("type") == "look"
            ][:look_max]
            if look_ops and look_max > 0:
                from pathlib import Path

                from src.chat.hero_look.describe import vlm_desc, weak_desc
                from src.chat.hero_look.run import format_look_blob, run_looks

                def _sync_describe(path, hero_id, name):
                    return weak_desc(hero_id, name)

                look_blob, pending_ref, results = await asyncio.to_thread(
                    run_looks,
                    look_ops,
                    self_hero_id=str(
                        getattr(self.settings, "chat_game_self_hero_id", "101003")
                        or "101003"
                    ),
                    session_id=req.session.session_id,
                    max_ops=look_max,
                    describe=_sync_describe,
                )
                if pending_ref and pending_ref.get("path") and results and results[-1].get("ok"):
                    better = await vlm_desc(
                        self.settings,
                        Path(pending_ref["path"]),
                        hero_id=str(pending_ref.get("hero_id") or ""),
                        name=str(pending_ref.get("name") or ""),
                    )
                    if better:
                        results[-1]["desc"] = better[:200]
                        look_blob = format_look_blob(results)
                if look_blob:
                    parts.append(look_blob)
                    self._write_trace(
                        req,
                        {
                            "event": "hero_look",
                            "ops": look_ops,
                            "result": (look_blob or "")[:500],
                        },
                    )
                if pending_ref:
                    ml.pending_look_ref = pending_ref
```

4. Update second-pass instruction string to mention look.

5. Strip set: add `"look"`.

6. Draw sources:

```python
                user_srcs = self._draw_sources(req)
                sources = user_srcs
                if not sources and draw_req.get("use_ref"):
                    ref = getattr(ml, "pending_look_ref", None) or {}
                    path = str(ref.get("path") or "").strip()
                    if path:
                        from pathlib import Path
                        if Path(path).is_file():
                            sources = [path]
                            ml.pending_look_ref = None
                return await self._start_draw_job(
                    ...,
                    sources=sources,
                    ...
                )
```

7. System prompt block when `chat_hero_look_enabled` (near draw / game tools):

```text
【外观工具｜本轮可声明】
- 用户问长相/立绘/「画一张你」需要角色外观时：replies 加 {"type":"look","q":"角色名|self|"}；空或 self = 自己（chatGameSelfHeroId）。
- 【工具结果】含 desc 与 ref_available；不要编造五官。
- 要按该长相画画：再声明 {"type":"draw","prompt":"场景画风","use_ref":true}；有用户图时仍优先用户图。
```

Also extend【画画工具】line to mention optional `use_ref`.

- [ ] **Step 4: Run tests — PASS**

Run: `cd /opt/yunzai/plugins/yoyo-plugin/server && uv run pytest tests/test_hero_look_*.py -q`

- [ ] **Step 5: Commit**

```bash
git add server/src/chat/mainline.py server/src/chat/hero_look server/tests/test_hero_look_twophase.py
git commit -m "$(cat <<'EOF'
feat(hero-look): two-phase look injection and draw.use_ref sources

EOF
)"
```

---

### Task 6: Persona / help docs + ops note

**Files:**
- Modify: `server/prompts/persona.md`
- Modify: `server/src/chat/help_capabilities.py` (one line: 问长相用 look，整页图鉴仍 ~)
- Modify: `docs/12-game-knowledge.md` — short §「角色外观 look」linking the spec; note `data/cache/hero_imgs.json` regenerated by `getHeroImgs`
- Optional: `docs/07-chat-brain-mainline.md` one-line pointer if it lists tools

**Interfaces:** none new.

- [ ] **Step 1: Edit persona**

Add section after 图鉴工具 (or near 画画):

```markdown
### 外观工具（look）

本地立绘不进上下文。问长相 / 「画一张你」时先声明：
`{"type":"look","q":"寒悠悠"}` 或 `"self"` / 空（自己）。

有【工具结果】再描述；要按长相画：`{"type":"draw","prompt":"…","use_ref":true}`。
不要空口编立绘细节；不要 look 后假装已经发出图片。
```

Update the画画 example to show optional `use_ref`.

- [ ] **Step 2: help_capabilities + docs**

- help: clarify 长相/立绘 → look；整页 → ~指令  
- docs: index regeneration + config keys `chatHeroLookEnabled` / `chatHeroLookMaxPerTurn`

- [ ] **Step 3: Commit**

```bash
git add server/prompts/persona.md server/src/chat/help_capabilities.py docs/12-game-knowledge.md
git commit -m "$(cat <<'EOF'
docs(hero-look): persona, help, and ops notes for look + use_ref

EOF
)"
```

---

## Spec coverage (self-review)

| Spec item | Task |
|-----------|------|
| Decoupled `look` tool | 2, 4, 5 |
| desc + ref_available; no path in tool result | 2, 5 tests |
| `pending_look_ref` session state | 5 |
| `draw.use_ref` | 4, 5 |
| Node getHeroImgs truth via index | 1 |
| Copy to media/looks | 2 |
| VLM optional, weak fallback | 2, 3, 5 |
| User photo priority | 5 test |
| Caps + separate from lookup | 4, 5 |
| Config flags | 4, 6 |
| Persona / system tool face | 5, 6 |
| Acceptance: look-only no auto-draw | 5 |
| Acceptance: look→draw sources | 5 |
| Miss ok:false | 2 |
| Non-goals excluded | Global Constraints |

No TBD/placeholder steps remain after Task 5’s `run_looks` return shape is locked to `(blob, pending, results)`.
