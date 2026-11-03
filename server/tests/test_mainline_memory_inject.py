import asyncio
from pathlib import Path

import pytest

from src.chat.mainline import MainlineManager, reset_mainline_manager_for_tests
from src.chat.memory.store import reset_memory_store_for_tests
from src.chat.schema import ChatHints, ChatRequest, SessionInfo
from src.core.settings import Settings


@pytest.mark.asyncio
async def test_reply_prompt_contains_profile(tmp_path: Path):
    store = reset_memory_store_for_tests(tmp_path)
    store.append_group_facts("1", ["群规：别刷屏"])
    store.update_user("1", "100", {"preferences": ["喜欢奶茶"]})

    captured: list = []

    async def capture_llm(messages, settings, *, abort_event=None):
        captured.append(messages)
        await asyncio.sleep(0.01)
        return '{"replies":[{"type":"text","text":"好的"}]}'

    settings = Settings(
        llm_api_key="x",
        chat_memory_enabled=True,
        chat_embedding_enabled=False,
        chat_extract_enabled=False,
        proactive_enabled=False,
        chat_heat_debounce_sec=0.05,
        chat_at_reaction_sec=(0.0, 0.0),
    )
    mgr = reset_mainline_manager_for_tests(
        MainlineManager(settings=settings, llm_complete=capture_llm)
    )
    req = ChatRequest(
        request_id="m1",
        session=SessionInfo(session_id="group:1:bot:2", group_id="1", bot_id="2"),
        message={
            "user_id": "100",
            "sender": {"nickname": "测试"},
            "raw_message": "你好",
            "message": [{"type": "text", "text": "你好"}],
        },
        recent=[],
        hints=ChatHints(at_bot=True),
    )
    data = await mgr.handle(req)
    assert data.reason == "hold"
    pending = None
    for _ in range(40):
        await asyncio.sleep(0.05)
        pending = mgr.drain_pending("group:1:bot:2")
        if pending and pending.replies:
            break
    assert pending is not None
    assert captured
    system = captured[0][0]["content"]
    assert "群规" in system or "群画像" in system
    assert "奶茶" in system or "用户画像" in system


@pytest.mark.asyncio
async def test_remember_command(tmp_path: Path):
    store = reset_memory_store_for_tests(tmp_path)
    settings = Settings(llm_api_key="x", chat_memory_enabled=True, proactive_enabled=False)

    async def unused_llm(*a, **k):
        raise AssertionError("should not call llm")

    mgr = reset_mainline_manager_for_tests(
        MainlineManager(settings=settings, llm_complete=unused_llm)
    )
    req = ChatRequest(
        request_id="m2",
        session=SessionInfo(session_id="group:1:bot:2", group_id="1", bot_id="2"),
        message={
            "user_id": "100",
            "sender": {"nickname": "测试"},
            "raw_message": "记住：我喜欢早起",
            "message": [{"type": "text", "text": "记住：我喜欢早起"}],
        },
        recent=[],
        hints=ChatHints(at_bot=True),
    )
    data = await mgr.handle(req)
    assert data.action == "reply"
    assert data.reason == "memory_remember"
    notes = store.load_user("1", "100")["notes"]
    assert any("早起" in n for n in notes)


@pytest.mark.asyncio
async def test_session_preload(tmp_path: Path):
    store = reset_memory_store_for_tests(tmp_path)
    store.append_session(
        "1",
        user_id="100",
        user_text="昨天聊过奶茶",
        bot_replies=["记得呢"],
        max_turns=20,
    )
    settings = Settings(
        llm_api_key="x",
        chat_memory_enabled=True,
        chat_extract_enabled=False,
        chat_embedding_enabled=False,
    )
    mgr = reset_mainline_manager_for_tests(
        MainlineManager(settings=settings, llm_complete=lambda *a, **k: None)
    )
    ml = mgr.get("group:1:bot:2", group_id="1")
    texts = " ".join(str(e.get("text") or "") for e in ml.timeline)
    bot_blob = " ".join(
        str(r.get("text") or "")
        for e in ml.timeline
        if e.get("type") == "bot"
        for r in (e.get("replies") or [])
        if isinstance(r, dict)
    )
    assert "奶茶" in texts
    assert "记得" in bot_blob
