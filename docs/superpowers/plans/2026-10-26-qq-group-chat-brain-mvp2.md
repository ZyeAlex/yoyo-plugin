# QQ Group Chat Brain MVP-2 Plan

**Goal:** Full in-group chat behavior: proactive replies, async tools on single mainline, ack_busy, tool_done narrative (A then B), outbox delivery.

**Stack:** Same as MVP-1 (FastAPI server + Yunzai plugin).

## Scope

1. `should_respond` proactive heuristics + cooldown + per-minute cap
2. Draw (mock async) job; `tool_running` + pending interrupts; `tool_done` → mainline LLM
3. `GET /api/chat/pending` outbox; plugin polls while busy
4. Config: `chatProactive*` / `chatToolsEnabled`

Out of scope: real image API provider wiring (mock path first; hook for real URL later), SSE, DSH.
