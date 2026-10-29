# TTS Voice System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the persona declare `{"type":"tts","text":"…"}` so Chat Brain synthesizes speech via OpenAI-compatible `/v1/audio/speech` and sends a QQ voice bubble; masters upload one global reference voice in the web panel.

**Architecture:** Mirror the draw async job. Settings `chatTts*` + optional `server/data/tts/default.{wav,json}`. `run_tts_job` POSTs speech, writes `data/media/voice/`. `_on_tool_done` branches on `result.kind` (`image` vs `audio`). Outbound `ReplyBubble(type="record")` → `segment.record`. Panel uploads under Express auth; preview hits FastAPI.

**Tech Stack:** Python 3.11+, httpx, FastAPI, pytest, Yunzai `segment.record`, Express panel.

**Spec:** [`docs/superpowers/specs/2026-10-29-tts-voice-system-design.md`](../specs/2026-10-29-tts-voice-system-design.md)

## Global Constraints

- Only OpenAI-compatible `POST /v1/audio/speech`; no per-vendor plugins.
- Successful TTS turn: **voice bubble only** (no duplicate text); start job **silent** (empty replies + `reason=tool_started` + busy so poller runs).
- Discard `tts` silently when disabled / no voice available.
- `_on_tool_done` must branch by `result.kind` so draw still inserts `image`.
- Paths confined under `data/media` / `data/tts`.
- Out of scope: multi-voice library, QQ sync command, auto probability TTS, STT.

## File map

| File | Responsibility |
|------|----------------|
| `config/default.yaml` + `settings.py` + `web-config-schema.js` | TTS knobs |
| `server/src/chat/tts/paths.py` | `data/tts`, `data/media/voice` |
| `server/src/chat/tts/voice.py` | load/save/clear default voice meta + bytes |
| `server/src/chat/tts/client.py` | `synthesize_speech(...)` → bytes |
| `server/src/chat/tts/job.py` | `run_tts_job` |
| `server/src/chat/tts/scope.py` | group include/exclude + `tts_available` |
| `server/src/api/tts.py` | preview (+ optional status) |
| `server/src/chat/llm.py` / `schema.py` / `mainline.py` | parse, inject, start, done |
| `api/chat/reply.js` | `segment.record` |
| `utils/web-panel.js` + `resources/web/*` | upload / clear / preview UI |
| `server/tests/test_tts_*.py` | unit + wiring |

---

### Task 1: Settings + voice store + OpenAI speech client

**Files:**
- Modify: `config/default.yaml`, `server/src/core/settings.py`, `utils/web-config-schema.js`
- Create: `server/src/chat/tts/{__init__,paths,voice,client,scope}.py`
- Test: `server/tests/test_tts_client.py`, `server/tests/test_tts_voice.py`, `server/tests/test_tts_scope.py`

**Interfaces:**
- `default_voice_paths() -> (wav: Path, meta: Path)`
- `load_default_voice() -> dict | None` with keys `path`, `prompt_text`, `exists`
- `save_default_voice(audio: bytes, *, filename: str, prompt_text: str) -> dict`
- `clear_default_voice() -> None`
- `tts_group_allowed(group_id: str, *, include: list[str], exclude: list[str]) -> bool`
- `tts_ready(settings, *, group_id: str = "") -> bool`
- `async synthesize_speech(*, text, settings, speed=None, style=None) -> bytes`

- [ ] **Step 1: Failing tests** for voice save/load, scope include/exclude, client posts `/v1/audio/speech` with `input`/`model`/`voice` and optional `ref_audio`/`ref_text` when default wav exists (httpx mock).

- [ ] **Step 2: Implement** settings fields + YAML + schema subgroup「语音 TTS」; implement modules above. Default: `chatTtsEnabled: false`, `chatTtsVoice: "default"`, `chatTtsSpeed: 1.0`, `chatTtsFormat: wav`, `chatTtsMaxChars: 80`, empty include/exclude/base/key/model.

- [ ] **Step 3: Pass tests + commit** `feat(tts): settings, voice store, OpenAI speech client`

---

### Task 2: `run_tts_job` + schema `record` + parse `tts`

**Files:**
- Create: `server/src/chat/tts/job.py`
- Modify: `server/src/chat/schema.py`, `server/src/chat/llm.py`, `server/src/chat/mainline.py` (`_confined_*` allow voice paths)
- Test: `server/tests/test_tts_job.py`, extend parse tests

**Interfaces:**
- `async run_tts_job(*, job_id, text, settings, on_done, speed=None, style=None) -> None`
- Result ok: `{ok, kind:"audio", path, text}` ; fail: `{ok:False, kind:"audio", error}`
- Truncate `text` to `chat_tts_max_chars` before synthesize
- `parse_persona_json` accepts `type=tts` with `text`/`speed`/`style` (does not consume text budget)

- [ ] **Step 1: Failing tests** mock synthesize → file under voice dir; parse tts bubble.

- [ ] **Step 2: Implement** job + schema Literal + parse + confine helper rename/extend to media roots including voice.

- [ ] **Step 3: Pass + commit** `feat(tts): job runner and persona tts bubble parse`

---

### Task 3: Mainline inject + start/done + voice-only outbox

**Files:**
- Modify: `server/src/chat/mainline.py` (`_build_messages`, `_generate` draw-adjacent, `_start_tts_job`, `_on_tool_done`)
- Test: `server/tests/test_tts_inject.py`, `server/tests/test_tts_mainline.py`

**Behavior:**
- Inject【语音工具】iff `tts_ready(settings, group_id=...)`
- After stripping sync tools, prefer `tts` like draw: if tts declared and ready → `_start_tts_job` (silent: `replies=[]`, `reason=tool_started`, busy set)
- If not ready → drop tts bubbles
- `_on_tool_done`: if `kind=="audio"` and ok → push **only** `ReplyBubble(type="record", path=...)` (skip draw-style narrate LLM); if fail → one short text「这句没发出去」; if `kind=="image"` keep existing narrate+image insert

- [ ] **Step 1: Failing inject/mainline tests**

- [ ] **Step 2: Implement wiring**

- [ ] **Step 3: Pass + commit** `feat(tts): mainline tool face and async voice job`

---

### Task 4: QQ `segment.record` + panel upload/preview

**Files:**
- Modify: `api/chat/reply.js`
- Create: `server/src/api/tts.py`; register in `main.py`
- Modify: `utils/web-panel.js`, `resources/web/app.js` (+ minimal HTML/CSS if needed), `web-config-schema.js` notes
- Test: reply unit if present; API test for preview with mocked client

**Behavior:**
- `sendReplies`: `bubble.type === 'record' && bubble.path` → `segment.record(path)`
- FastAPI `POST /api/tts/preview` body `{text}` → wav bytes (`audio/wav`)
- Express (auth): `GET/POST/DELETE /api/tts/voice` manage files under `server/data/tts/`; `POST /api/tts/preview` proxy to chatPort
- Panel UI on chat section: upload audio, prompt_text, clear, preview button, compliance one-liner

- [ ] **Step 1–3: implement, smoke test, commit** `feat(tts): QQ record send and panel voice upload`

---

### Task 5: Docs touch + regression

- Update `docs/10-capabilities-and-stickers.md` or short note in README chat section: TTS config keys + restart
- Run: `uv run pytest tests/test_tts_*.py tests/test_draw_job.py tests/test_game_kb_inject.py -q`
- Commit: `docs: note TTS voice system`

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| OpenAI `/v1/audio/speech` | 1 |
| Global default voice panel upload | 1, 4 |
| Model declares tts | 2, 3 |
| Voice-only outbox | 3 |
| speed / style optional | 1–3 |
| include/exclude + enabled | 1, 3 |
| Preview | 4 |
| kind branch vs draw | 3 |
| segment.record | 4 |
