# Game Knowledge Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Chat Brain always-on 星原世界观 + 悠悠(101003) cards, plus on-demand YAML entity lookup/expand (sync two-phase), without dumping megabyte game files into the prompt.

**Architecture:** Read-only Python KB over `data/game/*.yaml` (mtime-cached). L0 blocks append to system next to `capability_block()`. Model may emit `{"type":"lookup"|"expand",...}` like draw; mainline runs KB then regenerates once with 【工具结果】 before outbound.

**Tech Stack:** Python 3.12, PyYAML, existing `mainline.py` / `parse_persona_json` / pytest / `Settings` + `config.yaml`.

**Spec:** [`docs/superpowers/specs/2026-10-28-game-knowledge-injection-design.md`](../specs/2026-10-28-game-knowledge-injection-design.md)

## Global Constraints

- Chat **only reads** `data/game/**`; does not crawl Wiki.
- Do **not** inject full `pet.yaml` / `item.yaml` into prompts.
- MEMORY extract continues to reject lore/数值 (no change to that policy).
- MVP is **sync two-phase** lookup (no async job).
- Default self hero id: `"101003"`.
- Max lookups per turn: `chatGameLookupMax` default `2`.
- L0 hard cap: `chatGameL0MaxChars` default `2800`.
- Outbound must never dump raw tool JSON / stage directions (existing parse guards).
- Guide/RAG (L2/L3) is **out of MVP**; Tasks 1–6 only. Task 7 is docs + config wiring only for MVP flags.

## File map

| File | Responsibility |
|------|----------------|
| `server/src/chat/game_kb/paths.py` | Resolve plugin `data/game` root |
| `server/src/chat/game_kb/loader.py` | mtime-cached YAML load |
| `server/src/chat/game_kb/cards.py` | Entity → slim card; L0 lore/self summarizers |
| `server/src/chat/game_kb/resolve.py` | Name/alias/id → (kind, id) |
| `server/src/chat/game_kb/expand.py` | Follow relation edges |
| `server/src/chat/game_kb/__init__.py` | Public API: `game_l0_block`, `run_lookups` |
| `server/src/chat/llm.py` | Parse `lookup` / `expand` bubbles |
| `server/src/chat/mainline.py` | Inject L0; two-phase lookup in `_generate` |
| `server/src/core/settings.py` + `config/*.yaml` + web schema | Feature flags |
| `server/tests/test_game_kb_*.py` | Unit + wiring tests |
| `docs/12-game-knowledge.md` | Short index after MVP |

---

### Task 1: YAML loader + paths

**Files:**
- Create: `server/src/chat/game_kb/paths.py`
- Create: `server/src/chat/game_kb/loader.py`
- Create: `server/src/chat/game_kb/__init__.py` (exports filled in later tasks)
- Test: `server/tests/test_game_kb_loader.py`

**Interfaces:**
- Produces: `game_data_root() -> Path`; `load_yaml(name: str) -> Any` where `name` is like `"hero"` → `hero.yaml`; cache by `(path, mtime)`.

- [ ] **Step 1: Write failing tests**

```python
# server/tests/test_game_kb_loader.py
from src.chat.game_kb.loader import load_yaml
from src.chat.game_kb.paths import game_data_root


def test_game_data_root_points_at_data_game():
    root = game_data_root()
    assert (root / "hero.yaml").is_file()
    assert (root / "lore" / "promilia.yaml").is_file()


def test_load_hero_yaml_has_101003():
    data = load_yaml("hero")
    assert isinstance(data, dict)
    assert "101003" in data
    assert data["101003"]["name"] == "寒悠悠"
```

- [ ] **Step 2: Run tests — expect FAIL (import error)**

Run: `cd server && uv run pytest tests/test_game_kb_loader.py -q`

- [ ] **Step 3: Implement paths + loader**

```python
# server/src/chat/game_kb/paths.py
from pathlib import Path

_PLUGIN_ROOT = Path(__file__).resolve().parents[4]  # .../yoyo-plugin


def game_data_root() -> Path:
    return _PLUGIN_ROOT / "data" / "game"
```

```python
# server/src/chat/game_kb/loader.py
from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from src.chat.game_kb.paths import game_data_root

_cache: dict[str, tuple[float, Any]] = {}


def load_yaml(stem: str) -> Any:
    """stem: 'hero' | 'pet' | 'lore/promilia' etc."""
    path = game_data_root() / f"{stem}.yaml"
    if not path.is_file():
        return None
    mtime = path.stat().st_mtime
    hit = _cache.get(str(path))
    if hit and hit[0] == mtime:
        return hit[1]
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    _cache[str(path)] = (mtime, data)
    return data


def clear_loader_cache_for_tests() -> None:
    _cache.clear()
```

Verify parents count: `game_kb` → `chat` → `src` → `server` → `yoyo-plugin` = parents[4]. If wrong in runtime, fix to `parents[3]` after printing `Path(__file__).resolve().parents`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd server && uv run pytest tests/test_game_kb_loader.py -q`

- [ ] **Step 5: Commit** (only if user asked for commits)

```bash
git add server/src/chat/game_kb server/tests/test_game_kb_loader.py
git commit -m "feat(chat): add mtime-cached game YAML loader"
```

---

### Task 2: Cards + L0 summarizers

**Files:**
- Create: `server/src/chat/game_kb/cards.py`
- Test: `server/tests/test_game_kb_cards.py`

**Interfaces:**
- Consumes: `load_yaml`
- Produces:
  - `hero_card(raw: dict) -> dict`
  - `pet_card(raw: dict) -> dict` (minimal: id, name, element, race, stage, tag, feature, desc[:200])
  - `suit_card(raw: dict) -> dict` (id, name, effect2, effect4, relatedPet)
  - `self_hero_card(hero_id: str = "101003") -> dict | None`
  - `lore_l0_text(*, max_chars: int = 2000) -> str`
  - `game_l0_block(*, self_hero_id: str = "101003", max_chars: int = 2800) -> str`

Card rules: strip `icon` / `*Icon` / `descHtml` / `template` / full skill bodies; skills → list of `{name}` only (max 6).

Lore L0: from `lore/promilia` + `lore/game-info`, take sections whose `title` in allowlist `{"世界观","地区","阵营","种族","元素","职业","普罗米利亚"}` (substring match OK); each text clipped to 400 chars; skip empty text.

- [ ] **Step 1: Failing tests**

```python
from src.chat.game_kb.cards import game_l0_block, self_hero_card
from src.chat.game_kb.loader import clear_loader_cache_for_tests


def setup_function():
    clear_loader_cache_for_tests()


def test_self_hero_card_youyou():
    card = self_hero_card("101003")
    assert card is not None
    assert card["name"] == "寒悠悠"
    assert "火" in str(card.get("element"))
    assert "skills" in card
    assert all("desc" not in s for s in card["skills"])


def test_game_l0_block_mentions_world_and_self():
    text = game_l0_block(self_hero_id="101003", max_chars=2800)
    assert "【星原世界观】" in text
    assert "【悠悠自己" in text
    assert "寒悠悠" in text
    assert len(text) <= 2800
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd server && uv run pytest tests/test_game_kb_cards.py -q`

- [ ] **Step 3: Implement `cards.py`** (full file; keep helpers private with `_`)

Key sketch for `game_l0_block`:

```python
def game_l0_block(*, self_hero_id: str = "101003", max_chars: int = 2800) -> str:
    lore = lore_l0_text(max_chars=max(500, max_chars // 2))
    self_card = self_hero_card(self_hero_id) or {}
    nick = load_yaml("nickname") or {}
    aliases = nick.get(str(self_hero_id)) or []
    lines = [
        "【星原世界观】",
        lore or "（暂无）",
        f"【悠悠自己｜图鉴 id={self_hero_id}】",
        f"名:{self_card.get('name')} 元素:{self_card.get('element')} "
        f"职业:{self_card.get('profession')} 阵营:{self_card.get('group')}",
        f"简介:{(self_card.get('intro') or self_card.get('desc') or '')[:160]}",
        f"别名:{'、'.join(aliases) if aliases else '无'}",
        "纪律:游戏事实以本块与【工具结果】为准；没有就说不确定，并引导用户发 ~指令（不必@）。",
    ]
    text = "\n".join(lines)
    return text[:max_chars]
```

Implement `hero_card` / `lore_l0_text` fully in the same file.

- [ ] **Step 4: Run — expect PASS**

Run: `cd server && uv run pytest tests/test_game_kb_cards.py -q`

- [ ] **Step 5: Commit** (if requested)

```bash
git add server/src/chat/game_kb/cards.py server/tests/test_game_kb_cards.py
git commit -m "feat(chat): L0 lore + self hero cards from game YAML"
```

---

### Task 3: resolve_name + lookup + expand

**Files:**
- Create: `server/src/chat/game_kb/resolve.py`
- Create: `server/src/chat/game_kb/expand.py`
- Modify: `server/src/chat/game_kb/__init__.py`
- Test: `server/tests/test_game_kb_resolve.py`

**Interfaces:**
- Produces:
  - `resolve_name(q: str) -> list[tuple[str, str]]`  # [(kind, id), ...] max 5
  - `lookup_entity(kind: str, q: str) -> dict`  # `{ok, kind, id, card?, candidates?, hint?}`
  - `expand_links(kind: str, id: str, edges: list[str]) -> dict`
  - `run_lookups(ops: list[dict], *, max_ops: int = 2) -> str`  # formats 【工具结果】 text

Kind stems map:

```python
KIND_FILE = {
    "hero": "hero",
    "pet": "pet",
    "spirit": "spirit",
    "item": "item",
    "accessory": "accessory",  # list or dict — handle both
    "suit": "suit",            # list
    "element": "element",
    "group": "groups",
    "profession": "profession",
}
```

Resolve order: exact id key → nickname reverse map → exact `name`/`page` → casefold contains (cap 5).

Expand edges MVP: `element`, `profession`, `group`, `relatedPet` (suit→pet by name).

- [ ] **Step 1: Failing tests**

```python
from src.chat.game_kb.resolve import lookup_entity, resolve_name
from src.chat.game_kb.expand import expand_links
from src.chat.game_kb import run_lookups
from src.chat.game_kb.loader import clear_loader_cache_for_tests


def setup_function():
    clear_loader_cache_for_tests()


def test_resolve_alias_tang_youyou():
    hits = resolve_name("唐悠悠")
    assert ("hero", "101003") in hits


def test_lookup_hero_by_name():
    out = lookup_entity("hero", "寒悠悠")
    assert out["ok"] is True
    assert out["id"] == "101003"
    assert out["card"]["name"] == "寒悠悠"


def test_lookup_missing():
    out = lookup_entity("hero", "绝对不存在的角色xyz")
    assert out["ok"] is False
    assert "图鉴" in (out.get("hint") or "")


def test_expand_suit_related_pet():
    # suit.yaml id 1 relatedPet 森彩灵蝶
    out = expand_links("suit", "1", ["relatedPet"])
    assert out["ok"] is True
    blob = str(out.get("links") or out)
    assert "森彩灵蝶" in blob or "pet" in blob.lower()


def test_run_lookups_formats_block():
    text = run_lookups([{"type": "lookup", "kind": "hero", "q": "寒悠悠"}], max_ops=2)
    assert "【工具结果】" in text
    assert "寒悠悠" in text
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement resolve/expand/`run_lookups`**

`run_lookups` sketch:

```python
def run_lookups(ops: list[dict], *, max_ops: int = 2) -> str:
    lines = ["【工具结果】"]
    for op in (ops or [])[: max(0, int(max_ops))]:
        typ = op.get("type")
        if typ == "lookup":
            lines.append(str(lookup_entity(str(op.get("kind") or ""), str(op.get("q") or ""))))
        elif typ == "expand":
            lines.append(
                str(
                    expand_links(
                        str(op.get("from_kind") or op.get("kind") or ""),
                        str(op.get("id") or ""),
                        list(op.get("edges") or []),
                    )
                )
            )
    return "\n".join(lines)[:4000]
```

Prefer `json.dumps(..., ensure_ascii=False)` for structured lines instead of `str(dict)`.

Export from `__init__.py`: `game_l0_block`, `run_lookups`, `lookup_entity`, `resolve_name`.

- [ ] **Step 4: Run — expect PASS**

Run: `cd server && uv run pytest tests/test_game_kb_resolve.py tests/test_game_kb_cards.py tests/test_game_kb_loader.py -q`

- [ ] **Step 5: Commit** (if requested)

---

### Task 4: Parse lookup/expand in persona JSON

**Files:**
- Modify: `server/src/chat/llm.py` (`parse_persona_json` loop, next to `draw`)
- Test: extend `server/tests/test_heat_transcript.py` or add `server/tests/test_game_kb_parse.py`

**Interfaces:**
- Produces bubbles like `{"type":"lookup","kind":"hero","q":"寒悠悠"}` and `{"type":"expand","from_kind":"suit","id":"1","edges":["relatedPet"]}`
- These do **not** count against `max_replies` text budget (same as sticker/draw).

- [ ] **Step 1: Failing test**

```python
from src.chat.llm import parse_persona_json


def test_parse_lookup_and_expand_bubbles():
    raw = '''{"engagement":"hold","replies":[
      {"type":"text","text":"稍等"},
      {"type":"lookup","kind":"hero","q":"寒悠悠"},
      {"type":"expand","from_kind":"suit","id":"1","edges":["relatedPet"]}
    ]}'''
    bubbles, eng = parse_persona_json(raw, max_replies=2)
    assert eng == "hold"
    types = [b.get("type") for b in bubbles]
    assert "lookup" in types and "expand" in types
    look = next(b for b in bubbles if b["type"] == "lookup")
    assert look["kind"] == "hero" and look["q"] == "寒悠悠"
```

- [ ] **Step 2: Run — expect FAIL** (lookup dropped)

- [ ] **Step 3: Add branches in `parse_persona_json`**

```python
        if typ == "lookup":
            out.append(
                {
                    "type": "lookup",
                    "kind": str(item.get("kind") or "").strip(),
                    "q": str(item.get("q") or item.get("query") or item.get("text") or "").strip(),
                }
            )
            continue
        if typ == "expand":
            edges = item.get("edges") or []
            if not isinstance(edges, list):
                edges = []
            out.append(
                {
                    "type": "expand",
                    "from_kind": str(item.get("from_kind") or item.get("kind") or "").strip(),
                    "id": str(item.get("id") or "").strip(),
                    "edges": [str(x).strip() for x in edges if str(x).strip()][:8],
                }
            )
            continue
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit** (if requested)

---

### Task 5: Settings + L0 inject into mainline

**Files:**
- Modify: `server/src/core/settings.py` — add fields + yaml merge keys
- Modify: `config/default.yaml`, `config/config.yaml`
- Modify: `utils/web-config-schema.js` (optional group `chat` / game kb)
- Modify: `server/src/chat/mainline.py` `_build_messages` after `capability_block()`
- Modify: `server/prompts/persona.md` — one bullet: 可声明 lookup/expand；有【工具结果】再答
- Test: `server/tests/test_game_kb_inject.py`

**Settings fields:**

```python
chat_game_kb_enabled: bool = Field(default=True, alias="CHAT_GAME_KB_ENABLED")
chat_game_self_hero_id: str = Field(default="101003", alias="CHAT_GAME_SELF_HERO_ID")
chat_game_l0_max_chars: int = Field(default=2800, alias="CHAT_GAME_L0_MAX_CHARS")
chat_game_lookup_max: int = Field(default=2, alias="CHAT_GAME_LOOKUP_MAX")
```

YAML keys: `chatGameKbEnabled`, `chatGameSelfHeroId`, `chatGameL0MaxChars`, `chatGameLookupMax`.

- [ ] **Step 1: Failing test**

```python
import asyncio
from src.chat.mainline import MainlineManager, reset_mainline_manager_for_tests
from src.chat.schema import ChatHints, ChatRequest, SessionInfo
from src.core.settings import Settings


@pytest.mark.asyncio
async def test_build_messages_includes_game_l0(monkeypatch):
    settings = Settings(chat_game_kb_enabled=True, chat_memory_enabled=False, llm_api_key="x")
    seen = {}

    async def fake_llm(messages, settings, *, abort_event=None):
        seen["sys"] = messages[0]["content"]
        return '{"engagement":"hold","replies":[{"type":"text","text":"嗯"}]}'

    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=fake_llm))
    req = ChatRequest(
        request_id="g1",
        session=SessionInfo(session_id="group:gk1:bot:2", group_id="gk1", bot_id="2"),
        message={"user_id": "1", "sender": {"nickname": "t"}, "message": [{"type": "text", "text": "嗨"}], "raw_message": "嗨"},
        recent=[],
        hints=ChatHints(at_bot=True, wake_word=False, reply_to_bot=False),
    )
    await mgr.handle(req)
    await asyncio.sleep(0.15)
    mgr.drain_pending("group:gk1:bot:2")
    assert "【星原世界观】" in seen["sys"]
    assert "寒悠悠" in seen["sys"]
```

(If handle debounce makes this flaky, call `await mgr._build_messages(req, mgr.get(...), "嗨")` directly under lock-free test helper.)

Preferred direct test:

```python
@pytest.mark.asyncio
async def test_build_messages_includes_game_l0_direct():
    settings = Settings(chat_game_kb_enabled=True, chat_memory_enabled=False)
    mgr = MainlineManager(settings=settings)
    req = ...  # same as above
    ml = mgr.get(req.session.session_id, group_id=req.session.group_id)
    messages = await mgr._build_messages(req, ml, "嗨")
    sys = messages[0]["content"]
    assert "【星原世界观】" in sys
```

- [ ] **Step 2: Implement settings + inject**

In `_build_messages` after caps:

```python
        if getattr(self.settings, "chat_game_kb_enabled", True):
            try:
                from src.chat.game_kb import game_l0_block
                block = game_l0_block(
                    self_hero_id=str(getattr(self.settings, "chat_game_self_hero_id", "101003") or "101003"),
                    max_chars=int(getattr(self.settings, "chat_game_l0_max_chars", 2800) or 2800),
                )
                if block:
                    system = f"{system}\n\n{block}"
            except Exception as err:
                _logger.warning("game L0 inject failed: %s", err)
```

When `chat_game_kb_enabled`, also append short tool hint in system (or persona.md):

`需要查图鉴时在 replies 加 {"type":"lookup","kind":"hero|pet|suit|...","q":"名称或id"}；关联用 {"type":"expand","from_kind":"...","id":"...","edges":["relatedPet","element"]}。`

- [ ] **Step 3: Run inject test PASS**

- [ ] **Step 4: Commit** (if requested)

---

### Task 6: Sync two-phase lookup in `_generate`

**Files:**
- Modify: `server/src/chat/mainline.py` `_generate` after `parse_persona_json` (before draw / empty / resolve stickers)
- Test: `server/tests/test_game_kb_twophase.py`

**Flow:**

1. Parse bubbles.
2. Collect ops = `[b for b in bubbles if b.get("type") in {"lookup","expand"}][:lookup_max]`.
3. If ops non-empty and kb enabled:
   - `tool_blob = run_lookups(ops, max_ops=...)`
   - `_write_trace(..., event="game_lookup", ops=..., result=tool_blob[:500])`
   - Rebuild messages = `await self._build_messages(...)` then append user message: `f"{tool_blob}\n请依据【工具结果】用 JSON 短句回答；不要再重复同一 lookup，除非结果不够。"`
   - Call LLM again → replace `bubbles, engagement`.
4. Strip any remaining lookup/expand from final bubbles before sticker resolve / send.
5. Proceed with draw / empty / stickers as today.

- [ ] **Step 1: Failing integration test**

```python
@pytest.mark.asyncio
async def test_lookup_triggers_second_llm_with_tool_result():
    calls = {"n": 0}

    async def fake_llm(messages, settings, *, abort_event=None):
        calls["n"] += 1
        content = str(messages[-1].get("content") or "")
        if calls["n"] == 1:
            return '{"engagement":"hold","replies":[{"type":"lookup","kind":"hero","q":"寒悠悠"}]}'
        assert "【工具结果】" in content
        assert "寒悠悠" in content
        return '{"engagement":"hold","replies":[{"type":"text","text":"我是火木增幅啦"}]}'

    settings = Settings(
        chat_game_kb_enabled=True,
        chat_memory_enabled=False,
        chat_sticker_reply_enabled=False,
        chat_heat_enabled=False,
        llm_api_key="x",
        proactive_enabled=True,
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=fake_llm))
    req = ChatRequest(
        request_id="tp1",
        session=SessionInfo(session_id="group:tp1:bot:2", group_id="tp1", bot_id="2"),
        message={
            "user_id": "1",
            "sender": {"nickname": "t"},
            "message": [{"type": "text", "text": "你什么元素"}],
            "raw_message": "你什么元素",
        },
        recent=[],
        hints=ChatHints(at_bot=True, wake_word=False, reply_to_bot=False),
    )
    await mgr.handle(req)
    import asyncio
    await asyncio.sleep(0.2)
    pending = mgr.drain_pending("group:tp1:bot:2")
    assert pending and pending.replies
    assert "火" in (pending.replies[0].text or "") or "增幅" in (pending.replies[0].text or "")
    assert calls["n"] >= 2
```

(If heat-off path differs, set `chat_heat_enabled=True` and use at_bot + await outbox helper from existing tests.)

- [ ] **Step 2: Implement two-phase in `_generate`**

Keep draw handling: if first parse has draw and lookup, **prefer lookup first** then draw on second pass only if still present (MVP: if any lookup/expand, run two-phase and ignore draw on first parse).

- [ ] **Step 3: Run**

Run: `cd server && uv run pytest tests/test_game_kb_twophase.py tests/test_game_kb_resolve.py -q --tb=short`

- [ ] **Step 4: Manual smoke**

Restart chat server; in a chatInclude group `@悠悠 你什么元素` / `@悠悠 蝶语迷梦关联什么奇波` — expect grounded short reply; check `trace.jsonl` for `game_lookup`.

- [ ] **Step 5: Commit** (if requested)

---

### Task 7: Docs index (MVP closeout)

**Files:**
- Create: `docs/12-game-knowledge.md` (short pointer to spec + L0/L1 behavior)
- Modify: `docs/yunzai-plugin-api-memory.md` — one bullet under current conclusions
- Modify: `docs/README.md` — add row for doc 12
- Mark spec status: **MVP 已实现** (when Tasks 1–6 done)

- [ ] **Step 1: Write `docs/12-game-knowledge.md`** (~40 lines: L0/L1, config keys,非目标)
- [ ] **Step 2: Update memory index + README**
- [ ] **Step 3: Commit** (if requested)

---

## Spec coverage (self-review)

| Spec section | Task |
|--------------|------|
| L0 lore + self | Task 2, 5 |
| L1 lookup/expand + resolve nickname | Task 3, 4, 6 |
| Sync two-phase | Task 6 |
| Settings / flags | Task 5 |
| mtime loader | Task 1 |
| MEMORY reject unchanged | Global constraint (no task) |
| is_game_command boundary | Existing; twophase must not break (run `test_should_respond.py`) |
| L2 guide_search / lore_search | **Deferred** (not in MVP tasks) |
| L3 embedding | **Deferred** |

## Out of this plan

- Guide image VLM summaries, `guide_search`, embedding fuzzy search — follow-up plan after MVP lands.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-10-28-game-knowledge-injection.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session, executing-plans with checkpoints  

Which approach?
