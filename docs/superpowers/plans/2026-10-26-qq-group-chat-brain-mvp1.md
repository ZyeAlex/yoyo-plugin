# QQ Group Chat Brain MVP-1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship MVP-1: Yunzai plugin reports every whitelist-group message to a local `server/` Chat Brain that runs a single-mainline queue, rule-based `should_respond`, one LLM call on reply, and thinking-phase interrupt — without DSH/Harness tools.

**Architecture:** Plugin adapts QQ (buffer, hints, delivery, install/start). `server/` (yoyo-sauce content, developed under `plugins/yoyo-plugin/server/`) owns GroupMainline, should_respond, persona, OpenAI-compatible chat. Sync `POST /api/chat` JSON; `turn_gen` guards stale sends.

**Tech Stack:** Node.js ESM (Yunzai plugin), Python 3.11+ FastAPI + uvicorn + httpx (server), YAML config in plugin `config/config.yaml`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-26-qq-group-chat-brain-design.md`
- Repo for server clone: `https://gitee.com/yoyo-plugin/yoyo-sauce.git` → `server/`
- No DSH, no ReAct tool loop in MVP-1; mock tool job optional only if needed for interrupt tests later
- Game atlas/sign commands stay separate; chat must not block them (low priority / return false)
- `server/` remains a nested project (gitignore `server/` again); plugin never vendors Python deps
- Default listen port `8787`

## File Map

| Path | Role |
|------|------|
| `server/pyproject.toml` | uv project for Chat Brain |
| `server/src/main.py` | FastAPI app |
| `server/src/api/chat.py` | `POST /api/chat`, `GET /api/health` |
| `server/src/chat/mainline.py` | per-session queue, phase, turn_gen, abort |
| `server/src/chat/should_respond.py` | rule engine |
| `server/src/chat/llm.py` | OpenAI-compatible chat |
| `server/src/chat/persona.py` | load persona.md |
| `server/src/chat/schema.py` | request/response models |
| `server/prompts/persona.md` | default persona |
| `api/chat/*` | plugin client, buffer, trigger hints, reply, schema |
| `apps/chat.js` | message plugin (source); copied to load path if needed |
| `utils/chat-server.js` | start/stop/port probe |
| `utils/uv.js` | uv resolve/install |
| `apps/update.js` | restore `#安装悠悠` etc. |
| `config/default.yaml` | chat_* keys |
| `.gitignore` | ignore `server/`, `apps/chat.js` if copied |

---

### Task 1: Server scaffold + health + chat schema

**Files:**
- Create: `server/pyproject.toml`
- Create: `server/src/main.py`
- Create: `server/src/api/__init__.py`
- Create: `server/src/api/chat.py`
- Create: `server/src/chat/__init__.py`
- Create: `server/src/chat/schema.py`
- Create: `server/prompts/persona.md`
- Create: `server/tests/test_health.py`
- Modify: `.gitignore` (add `server/` except we develop server in-tree — actually keep server tracked OR gitignore; for yoyo-sauce workflow gitignore `server/` and develop by cloning; for this MVP create server locally and gitignore contents that are heavy `.venv`; **track server source in a way that can be pushed to yoyo-sauce** — implement under `server/` and add `server/.gitignore` for `.venv`, leave plugin `.gitignore` with `server/` so plugin users get it via install. During MVP, force-add server sources or temporarily not gitignore until push to yoyo-sauce. **Decision:** do not ignore entire `server/` in plugin during MVP; add `server/.gitignore` with `.venv/`, `__pycache__/`, `*.pid`, `yoagent.log`. Later push tree to yoyo-sauce and then ignore nested clone.)

**Interfaces:**
- Produces: `ChatRequest`, `ChatResponse` Pydantic models; `GET /api/health` → `{ok: true}`; `POST /api/chat` stub returns `action=skip`

- [ ] **Step 1: Create server package files**

`server/pyproject.toml`:

```toml
[project]
name = "yoyo-sauce"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "fastapi>=0.115.0",
  "uvicorn[standard]>=0.32.0",
  "httpx>=0.27.0",
  "pydantic>=2.0",
  "pydantic-settings>=2.0",
]

[tool.uv]
package = false
```

`server/src/chat/schema.py` — models matching spec §7 (`request_id`, `session`, `message`, `recent`, `hints`; response `action`, `reason`, `turn_gen`, `busy`, `replies`).

`server/src/api/chat.py` — router with health + chat stub.

`server/src/main.py` — create app, include router.

`server/prompts/persona.md` — short QQ 群友人设（悠悠 / 蓝色星原语气，短句）。

- [ ] **Step 2: Add `server/.gitignore`**

```
.venv/
__pycache__/
*.pyc
.yoagent.pid
*.log
.pytest_cache/
```

- [ ] **Step 3: `uv sync` and run health test**

```bash
cd server && uv sync && uv run pytest tests/test_health.py -v
```

Expected: PASS (TestClient get `/api/health` code 200).

- [ ] **Step 4: Commit**

```bash
git add server docs/superpowers/plans/2026-10-26-qq-group-chat-brain-mvp1.md
git commit -m "feat(chat): scaffold yoyo-sauce FastAPI health and chat schema"
```

---

### Task 2: should_respond rules + unit tests

**Files:**
- Create: `server/src/chat/should_respond.py`
- Create: `server/tests/test_should_respond.py`

**Interfaces:**
- Produces: `decide(hints, text, *, bot_names, wake_words, is_command) -> (action, reason)` where action in `reply|skip` (ack_busy handled in mainline when jobs running)

- [ ] **Step 1: Write failing tests** for at_bot→reply, wake_word→reply, reply_to_bot→reply, plain chatter→skip, `#角色图鉴` command→skip

- [ ] **Step 2: Implement `should_respond.py`**

- [ ] **Step 3: Run pytest — expect PASS**

- [ ] **Step 4: Commit** `feat(chat): add rule-based should_respond`

---

### Task 3: GroupMainline queue, thinking abort, LLM reply

**Files:**
- Create: `server/src/chat/mainline.py`
- Create: `server/src/chat/llm.py`
- Create: `server/src/chat/persona.py`
- Create: `server/src/core/settings.py`
- Create: `server/tests/test_mainline.py`
- Modify: `server/src/api/chat.py` to call mainline

**Interfaces:**
- Produces: `MainlineManager.handle(ChatRequest) -> ChatResponse`
- Settings read env + optional `../config/config.yaml` keys: `chatLlmApiKey` / fallback `agentLlmApiKey` migration → prefer new `chat*` keys from plugin config
- LLM: `async complete(messages, *, signal) -> str` via httpx; abort raises on cancel
- On active initiate while `phase==thinking`: cancel in-flight, bump `turn_gen`, process new event
- Reply bubbles: parse JSON `{"replies":[{"type":"text","text":"..."}]}`; fallback single text

- [ ] **Step 1: Tests** — skip path no LLM; at_bot returns reply shape; second active initiate aborts first (mock LLM sleep)

- [ ] **Step 2: Implement settings, persona, llm, mainline**

- [ ] **Step 3: Wire `POST /api/chat`**

- [ ] **Step 4: pytest PASS**

- [ ] **Step 5: Commit** `feat(chat): mainline queue with LLM reply and thinking interrupt`

---

### Task 4: Plugin config + chat API client/buffer/reply

**Files:**
- Modify: `config/default.yaml` — add chat keys
- Create: `api/chat/schema.js`
- Create: `api/chat/buffer.js`
- Create: `api/chat/trigger.js`
- Create: `api/chat/client.js`
- Create: `api/chat/reply.js`
- Create: `api/chat/buildPayload.js`
- Create: `tests/chat/should_trigger.test.js` (node:test) for wake/@ hints
- Modify: `package.json` — `#chat` import optional; add `test:chat` script

**Interfaces:**
- `sessionId(e)`, `append`, `snapshotRecent`, `isChatGroup`
- `buildHints(e, cfg)` → `{at_bot, wake_word, reply_to_bot}`
- `chat(payload, cfg)` → POST `/api/chat`
- `sendReplies(e, replies, {turnGen})`

Config keys (defaults):

```yaml
chatEnabled: false
chatPort: 8787
chatInclude: []
chatWakeWords: [悠悠, 小悠]
chatBufferSize: 20
chatMaxReplies: 3
chatReplyDelayMinMs: 500
chatReplyDelayMaxMs: 2000
chatLlmApiKey: ""
chatLlmBaseUrl: ""
chatLlmModel: deepseek-ai/DeepSeek-V4-Flash
chatInterruptEnabled: true
```

- [ ] **Step 1–4: implement modules + node test + commit** `feat(chat): plugin client buffer and config`

---

### Task 5: apps/chat.js + process manager + install commands

**Files:**
- Create: `api/chat/plugin.js` (canonical plugin source)
- Create: `utils/uv.js` (restore minimal)
- Create: `utils/chat-server.js`
- Modify: `apps/update.js` — re-add install/uninstall/start/stop/restart pointing at chat
- Modify: `index.js` — sync `api/chat/plugin.js` → `apps/chat.js`
- Modify: `.gitignore` — `apps/chat.js`
- Modify: `utils/web-config-schema.js` + `utils/web-panel.js` — add chat section fields (LLM + include + wake)
- Modify: `apps/login.js` copy already ok

**Behavior:**
- Whitelist group: every message `append` + async `runChat` (return false)
- Active initiate while local in-flight: still POST (server aborts); plugin tracks `turn_gen` and drops stale
- If server down and active initiate: short tip; else silent

- [ ] **Step 1: Implement chat-server + uv**
- [ ] **Step 2: Implement plugin.js + update.js commands**
- [ ] **Step 3: Panel chat section**
- [ ] **Step 4: Manual smoke** — `uv run uvicorn` + curl `/api/health` + curl `/api/chat` with at_bot
- [ ] **Step 5: Commit** `feat(chat): install/start hooks and Yunzai chat plugin`

---

### Task 6: Spec status + memory pointer

**Files:**
- Modify: `docs/superpowers/specs/2026-10-26-qq-group-chat-brain-design.md` status → MVP-1 implementing/done
- Modify: `docs/README.md` — link to spec

- [ ] **Step 1: Update docs**
- [ ] **Step 2: Commit** `docs: point memory index to Chat Brain spec`

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| server via yoyo-sauce / `#安装悠悠` | 5 |
| every message should_respond | 2, 5 |
| single mainline | 3 |
| thinking interrupt | 3 |
| tool_running / tool_done | deferred MVP-2 (not in this plan) |
| persona + LLM JSON bubbles | 3 |
| health + POST /api/chat | 1, 3 |
| config + panel | 4, 5 |
| game commands coexist | 5 (priority / skip commands) |

## Out of scope this plan

- Real draw tool + ack_busy path (MVP-2)
- SSE streaming
- DSH / SnowLuma
