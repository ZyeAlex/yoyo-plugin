"""纯表情：未到期只 glance_wait；到期可走快判。"""

import asyncio
import time

import pytest

from src.chat.mainline import MainlineManager, reset_mainline_manager_for_tests
from src.chat.schema import ChatHints, ChatRequest, SessionInfo
from src.chat.temperature import HeatState, save_heat
from src.core.settings import Settings


def _media_req(*, request_id: str, user_id: str = "100", group_id: str = "1") -> ChatRequest:
    return ChatRequest(
        request_id=request_id,
        session=SessionInfo(
            session_id=f"group:{group_id}:bot:2",
            group_id=group_id,
            bot_id="2",
        ),
        message={
            "user_id": user_id,
            "sender": {"nickname": "测", "user_id": user_id},
            "message": [{"type": "image", "url": "http://x/a.webp"}],
            "raw_message": "",
        },
        recent=[],
        hints=ChatHints(at_bot=False, wake_word=False, reply_to_bot=False),
    )


def _text_req(
    *,
    request_id: str,
    text: str,
    at_bot: bool = False,
    user_id: str = "100",
    group_id: str = "1",
) -> ChatRequest:
    return ChatRequest(
        request_id=request_id,
        session=SessionInfo(
            session_id=f"group:{group_id}:bot:2",
            group_id=group_id,
            bot_id="2",
        ),
        message={
            "user_id": user_id,
            "sender": {"nickname": "测", "user_id": user_id},
            "message": [{"type": "text", "text": text}],
            "raw_message": text,
        },
        recent=[],
        hints=ChatHints(at_bot=at_bot, wake_word=False, reply_to_bot=False),
    )


@pytest.mark.asyncio
async def test_media_before_due_skips_without_persona(monkeypatch):
    reset_mainline_manager_for_tests()
    settings = Settings(
        chat_heat_enabled=True,
        proactive_enabled=True,
        chat_heat_debounce_sec=0.01,
        chat_at_reaction_sec=(0.0, 0.0),
        chat_memory_enabled=False,
    )
    mgr = MainlineManager(settings=settings)

    async def _ok(*_a, **_k):
        return '{"engagement":"up","replies":[{"type":"text","text":"嗯"}]}'

    monkeypatch.setattr(mgr, "_llm_complete", _ok)
    await mgr.handle(_text_req(request_id="h1", text="嗨", at_bot=True))
    await asyncio.sleep(0.08)
    mgr.drain_pending("group:1:bot:2")

    async def _boom(*_a, **_k):
        raise AssertionError("pure media before glance due should not call llm")

    monkeypatch.setattr(mgr, "_llm_complete", _boom)
    # @ 后处于 dwelling，纯媒体仍会走快判；强制 away 未到期
    from src.chat.temperature import load_heat, save_heat

    heat = load_heat("1")
    heat.session = "away"
    heat.dwell_until = 0.0
    heat.next_glance_at = time.time() + 3600
    save_heat("1", heat)
    mgr.get("group:1:bot:2").heat = None
    out = await mgr.handle(_media_req(request_id="m1"))
    assert out.action == "skip"
    assert out.reason == "glance_wait"


@pytest.mark.asyncio
async def test_media_when_due_reaches_judge(monkeypatch):
    reset_mainline_manager_for_tests()
    gid = "mediajudge1"
    settings = Settings(
        chat_heat_enabled=True,
        proactive_enabled=True,
        chat_heat_debounce_sec=0.01,
        chat_memory_enabled=False,
    )
    mgr = MainlineManager(settings=settings)
    save_heat(
        gid,
        HeatState(
            attention=0.5,
            next_glance_at=1.0,
            pending_glance_span=30.0,
            last_human_at=time.time(),
        ),
    )
    judged = {"n": 0}

    async def _judge_silent(*_a, **_k):
        judged["n"] += 1
        return "silent"

    monkeypatch.setattr(mgr, "_judge", _judge_silent)
    out = await mgr.handle(_media_req(request_id="j1", group_id=gid))
    assert judged["n"] == 1
    assert out.reason == "heat_silent"
