import asyncio
import uuid

import pytest

from src.chat.mainline import MainlineManager, reset_mainline_manager_for_tests
from src.chat.schema import ChatHints, ChatRequest, SessionInfo
from src.core.settings import Settings


def _settings(**overrides) -> Settings:
    base = dict(
        chat_game_kb_enabled=True,
        chat_game_lookup_max=2,
        chat_memory_enabled=False,
        chat_sticker_reply_enabled=False,
        chat_heat_enabled=False,
        chat_heat_debounce_sec=0.05,
        llm_api_key="x",
        proactive_enabled=True,
        tools_enabled=True,
    )
    base.update(overrides)
    return Settings(**base)


def _req(text: str = "你什么元素") -> tuple[str, ChatRequest]:
    gid = f"tp{uuid.uuid4().hex[:8]}"
    sid = f"group:{gid}:bot:2"
    req = ChatRequest(
        request_id=gid,
        session=SessionInfo(
            session_id=sid, group_id=gid, bot_id="2", group_name="蓝色星原闲聊"
        ),
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


async def _await_outbox(mgr: MainlineManager, sid: str, timeout: float = 3.0):
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        pending = mgr.drain_pending(sid)
        if pending and pending.action == "reply" and pending.replies:
            return pending
        await asyncio.sleep(0.05)
    return None


def _cancel_jobs(mgr: MainlineManager, sid: str) -> None:
    ml = mgr.get(sid)
    for task in list(getattr(ml, "job_tasks", {}).values()):
        if task is not None and not task.done():
            task.cancel()


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
        assert "请依据【工具结果】" in content
        return '{"engagement":"hold","replies":[{"type":"text","text":"我是火木增幅啦"}]}'

    mgr = reset_mainline_manager_for_tests(
        MainlineManager(settings=_settings(), llm_complete=fake_llm)
    )
    sid, req = _req()
    try:
        await mgr.handle(req)
        pending = await _await_outbox(mgr, sid)
        assert pending and pending.replies
        blob = " ".join(r.text or "" for r in pending.replies)
        assert "火" in blob or "增幅" in blob
        assert "【工具结果】" not in blob
        assert calls["n"] >= 2
        assert all(r.type == "text" for r in pending.replies)
    finally:
        _cancel_jobs(mgr, sid)


@pytest.mark.asyncio
async def test_expand_triggers_second_llm_with_tool_result():
    calls = {"n": 0}

    async def fake_llm(messages, settings, *, abort_event=None):
        calls["n"] += 1
        content = str(messages[-1].get("content") or "")
        if calls["n"] == 1:
            return (
                '{"engagement":"hold","replies":['
                '{"type":"expand","from_kind":"suit","id":"1","edges":["relatedPet"]}'
                "]}"
            )
        assert "【工具结果】" in content
        assert "森彩灵蝶" in content or "pet" in content.lower()
        return '{"engagement":"hold","replies":[{"type":"text","text":"关联森彩灵蝶"}]}'

    mgr = reset_mainline_manager_for_tests(
        MainlineManager(settings=_settings(), llm_complete=fake_llm)
    )
    sid, req = _req("蝶语迷梦关联什么奇波")
    try:
        await mgr.handle(req)
        pending = await _await_outbox(mgr, sid)
        assert pending and pending.replies
        assert "森彩灵蝶" in (pending.replies[0].text or "")
        assert calls["n"] >= 2
    finally:
        _cancel_jobs(mgr, sid)


@pytest.mark.asyncio
async def test_lookup_plus_draw_ignores_draw_until_second_pass():
    """首轮同时有 lookup 和 draw 时先查图鉴，不启动画画。"""
    calls = {"n": 0}

    async def fake_llm(messages, settings, *, abort_event=None):
        calls["n"] += 1
        content = str(messages[-1].get("content") or "")
        if calls["n"] == 1:
            return (
                '{"engagement":"hold","replies":['
                '{"type":"lookup","kind":"hero","q":"寒悠悠"},'
                '{"type":"draw","prompt":"画一只猫"}'
                "]}"
            )
        if calls["n"] == 2:
            assert "【工具结果】" in content
            return (
                '{"engagement":"hold","replies":['
                '{"type":"text","text":"我是火木增幅啦"},'
                '{"type":"draw","prompt":"火元素立绘"}'
                "]}"
            )
        return '{"replies":[{"type":"text","text":"画好啦"}]}'

    mgr = reset_mainline_manager_for_tests(
        MainlineManager(
            settings=_settings(draw_mock_delay_sec=30),
            llm_complete=fake_llm,
        )
    )
    sid, req = _req("帮我画并告诉我元素")
    try:
        await mgr.handle(req)
        pending = await _await_outbox(mgr, sid)
        assert pending and pending.replies
        blob = " ".join(r.text or "" for r in pending.replies)
        assert "增幅" in blob
        assert pending.reason == "tool_started"
        assert calls["n"] == 2
        assert mgr.get(sid).running_jobs()
    finally:
        _cancel_jobs(mgr, sid)


@pytest.mark.asyncio
async def test_lookup_ops_capped_by_chat_game_lookup_max():
    calls = {"n": 0}

    async def fake_llm(messages, settings, *, abort_event=None):
        calls["n"] += 1
        content = str(messages[-1].get("content") or "")
        if calls["n"] == 1:
            return (
                '{"engagement":"hold","replies":['
                '{"type":"lookup","kind":"hero","q":"寒悠悠"},'
                '{"type":"lookup","kind":"hero","q":"不存在甲"},'
                '{"type":"lookup","kind":"hero","q":"不存在乙"}'
                "]}"
            )
        assert "【工具结果】" in content
        json_lines = [ln for ln in content.splitlines() if ln.startswith("{")]
        assert len(json_lines) == 2
        return '{"engagement":"hold","replies":[{"type":"text","text":"查过两条啦"}]}'

    mgr = reset_mainline_manager_for_tests(
        MainlineManager(settings=_settings(chat_game_lookup_max=2), llm_complete=fake_llm)
    )
    sid, req = _req("多查几个")
    try:
        await mgr.handle(req)
        pending = await _await_outbox(mgr, sid)
        assert pending and pending.replies
        assert "两条" in (pending.replies[0].text or "")
        assert calls["n"] >= 2
    finally:
        _cancel_jobs(mgr, sid)


@pytest.mark.asyncio
async def test_second_pass_strips_lookup_before_send():
    calls = {"n": 0}

    async def fake_llm(messages, settings, *, abort_event=None):
        calls["n"] += 1
        if calls["n"] == 1:
            return '{"engagement":"hold","replies":[{"type":"lookup","kind":"hero","q":"寒悠悠"}]}'
        return (
            '{"engagement":"hold","replies":['
            '{"type":"text","text":"我是火木增幅啦"},'
            '{"type":"lookup","kind":"hero","q":"寒悠悠"},'
            '{"type":"expand","from_kind":"suit","id":"1","edges":["relatedPet"]}'
            "]}"
        )

    mgr = reset_mainline_manager_for_tests(
        MainlineManager(settings=_settings(), llm_complete=fake_llm)
    )
    sid, req = _req()
    try:
        await mgr.handle(req)
        pending = await _await_outbox(mgr, sid)
        assert pending and pending.replies
        assert len(pending.replies) == 1
        assert pending.replies[0].text == "我是火木增幅啦"
        assert calls["n"] == 2
    finally:
        _cancel_jobs(mgr, sid)


@pytest.mark.asyncio
async def test_kb_disabled_does_not_second_call():
    calls = {"n": 0}

    async def fake_llm(messages, settings, *, abort_event=None):
        calls["n"] += 1
        return '{"engagement":"hold","replies":[{"type":"lookup","kind":"hero","q":"寒悠悠"},{"type":"text","text":"空口一句"}]}'

    mgr = reset_mainline_manager_for_tests(
        MainlineManager(settings=_settings(chat_game_kb_enabled=False), llm_complete=fake_llm)
    )
    sid, req = _req()
    try:
        await mgr.handle(req)
        pending = await _await_outbox(mgr, sid)
        assert pending and pending.replies
        assert pending.replies[0].text == "空口一句"
        assert calls["n"] == 1
        assert all("【工具结果】" not in (r.text or "") for r in pending.replies)
    finally:
        _cancel_jobs(mgr, sid)
