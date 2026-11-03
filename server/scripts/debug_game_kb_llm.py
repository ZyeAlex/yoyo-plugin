"""自调 LLM：验证图鉴 lookup/expand 声明 + 二段式落地。

用法（在 server/ 下）:
  uv run python scripts/debug_game_kb_llm.py
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.chat.llm import complete, parse_persona_json
from src.chat.mainline import MainlineManager, reset_mainline_manager_for_tests
from src.chat.schema import ChatHints, ChatRequest, SessionInfo
from src.core.settings import get_settings


CASES = [
    ("菜鸡是什么", "应 lookup pet 菜鸡"),
    ("蝶语迷梦关联什么奇波", "应 lookup suit 和/或 expand relatedPet"),
    ("忒拉拉是谁", "应 lookup hero 忒拉拉"),
    ("你知道菜鸡吗，奇波里的，查一下", "应 lookup pet 菜鸡"),
]


def _req(text: str, gid: str) -> ChatRequest:
    return ChatRequest(
        request_id=f"dbg-{gid}",
        session=SessionInfo(session_id=f"group:{gid}:bot:2", group_id=gid, bot_id="2"),
        message={
            "user_id": "384365260",
            "sender": {"nickname": "塔菲", "card": "塔菲"},
            "message": [{"type": "text", "text": text}],
            "raw_message": text,
        },
        recent=[],
        hints=ChatHints(at_bot=True, wake_word=False, reply_to_bot=False),
    )


def _summarize_bubbles(bubbles: list) -> str:
    parts = []
    for b in bubbles:
        if not isinstance(b, dict):
            continue
        typ = b.get("type")
        if typ == "lookup":
            parts.append(f"lookup({b.get('kind')},{b.get('q')})")
        elif typ == "expand":
            parts.append(
                f"expand({b.get('from_kind')},{b.get('id')},{b.get('edges')})"
            )
        elif typ == "text":
            parts.append(f"text:{str(b.get('text') or '')[:40]}")
        else:
            parts.append(str(typ))
    return " | ".join(parts) or "(empty)"


async def probe_first_pass(settings, text: str) -> tuple[list, str, str]:
    """Build real system+user, call LLM once, parse."""
    mgr = MainlineManager(settings=settings)
    req = _req(text, "dbgkb1")
    ml = mgr.get(req.session.session_id, group_id=req.session.group_id)
    messages = await mgr._build_messages(req, ml, text)
    raw = await complete(messages, settings.profile("text"))
    bubbles, eng = parse_persona_json(raw, max_replies=settings.max_replies)
    return bubbles, eng, raw


async def probe_full_handle(settings, text: str, *, label: str) -> dict:
    """Full mainline handle with real LLM; drain outbox."""
    calls: list[dict] = []

    async def tracing_llm(messages, call_settings, *, abort_event=None):
        raw = await complete(messages, call_settings, abort_event=abort_event)
        last = messages[-1].get("content") if messages else ""
        if isinstance(last, list):
            last = str(last)
        calls.append(
            {
                "n": len(calls) + 1,
                "last_user_head": str(last)[:180],
                "has_tool": "【工具结果】" in str(last),
                "raw_head": (raw or "")[:220],
            }
        )
        return raw

    mgr = reset_mainline_manager_for_tests(
        MainlineManager(
            settings=settings.model_copy(
                update={
                    "chat_memory_enabled": False,
                    "chat_sticker_reply_enabled": False,
                    "chat_heat_enabled": False,
                    "chat_heat_debounce_sec": 0.05,
                    "proactive_enabled": True,
                    "tools_enabled": False,
                }
            ),
            llm_complete=tracing_llm,
        )
    )
    sid = f"group:dbg{abs(hash(label)) % 10**8}:bot:2"
    gid = sid.split(":")[1]
    req = _req(text, gid)
    req = req.model_copy(
        update={
            "session": SessionInfo(session_id=sid, group_id=gid, bot_id="2"),
            "request_id": sid,
        }
    )
    await mgr.handle(req)
    pending = None
    for _ in range(60):
        pending = mgr.drain_pending(sid)
        if pending and getattr(pending, "replies", None):
            break
        await asyncio.sleep(0.1)
    replies = []
    if pending and pending.replies:
        for r in pending.replies:
            replies.append(getattr(r, "text", None) or str(r))
    return {
        "label": label,
        "text": text,
        "llm_calls": len(calls),
        "calls": calls,
        "replies": replies,
        "action": getattr(pending, "action", None) if pending else None,
    }


async def main() -> int:
    settings = get_settings()
    if not settings.llm_api_key.strip():
        print("FAIL: no llm_api_key after get_settings()")
        return 1
    print(
        f"LLM model={settings.llm_model} base={settings.llm_base_url} "
        f"kb={settings.chat_game_kb_enabled}"
    )

    print("\n===== PASS1: first LLM declaration =====")
    ok_flags = []
    for text, expect in CASES:
        print(f"\n--- {text} ({expect}) ---")
        try:
            bubbles, eng, raw = await probe_first_pass(settings, text)
        except Exception as err:
            print("ERROR", err)
            ok_flags.append(False)
            continue
        types = [b.get("type") for b in bubbles if isinstance(b, dict)]
        print("engagement", eng)
        print("bubbles", _summarize_bubbles(bubbles))
        print("raw", (raw or "")[:280])
        has_tool = any(t in {"lookup", "expand"} for t in types)
        ok_flags.append(has_tool)
        if not has_tool:
            print("!! NO TOOL DECLARED")

    print("\n===== FULL: mainline two-phase =====")
    full_cases = [
        ("菜鸡查一下", "pet"),
        ("蝶语迷梦关联什么奇波", "suit"),
        ("忒拉拉是谁", "hero"),
    ]
    for text, kind_hint in full_cases:
        print(f"\n--- full:{text} (expect kind≈{kind_hint}) ---")
        try:
            out = await probe_full_handle(settings, text, label=text)
        except Exception as err:
            print("ERROR", err)
            continue
        print("llm_calls", out["llm_calls"], "action", out["action"])
        for c in out["calls"]:
            print(
                f"  call{c['n']} tool_msg={c['has_tool']} raw={c['raw_head']!r}"
            )
        print("replies", out["replies"])
        # success heuristic: 2 calls and final reply not pure denial of existence
        # OR 1 call that already had grounded answer from L0 (unlikely for these)
        if out["llm_calls"] >= 2:
            print("OK two-phase fired")
        elif out["llm_calls"] == 1:
            print("WARN single call (no lookup?)")
        else:
            print("WARN no llm calls")

    passed = sum(1 for x in ok_flags if x)
    print(f"\n===== SUMMARY pass1 tool-declare {passed}/{len(ok_flags)} =====")
    return 0 if passed >= 3 else 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
