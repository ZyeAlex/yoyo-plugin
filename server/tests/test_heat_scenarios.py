"""时间看群场景：glance_wait → @硬触发 → 到期快判；路人不加线程 attention。"""

from __future__ import annotations

import asyncio
import uuid

import pytest

from src.chat.mainline import MainlineManager, reset_mainline_manager_for_tests
from src.chat.schema import ChatHints, ChatRequest, SessionInfo
from src.chat.temperature import HeatState, load_heat, save_heat
from src.core.settings import Settings


def _req(
    gid: str,
    text: str,
    *,
    at_bot: bool = False,
    user_id: str = "100",
    nick: str = "塔菲",
) -> ChatRequest:
    return ChatRequest(
        request_id=uuid.uuid4().hex,
        session=SessionInfo(session_id=f"group:{gid}:bot:2", group_id=gid, bot_id="2"),
        message={
            "user_id": user_id,
            "sender": {"nickname": nick},
            "raw_message": text,
            "message": [{"type": "text", "text": text}],
        },
        recent=[],
        hints=ChatHints(at_bot=at_bot),
    )


async def _wait_pending(mgr: MainlineManager, gid: str, timeout: float = 3.0):
    sid = f"group:{gid}:bot:2"
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        pending = mgr.drain_pending(sid)
        if pending:
            return pending
        await asyncio.sleep(0.05)
    return None


def _settings(**kwargs) -> Settings:
    base = dict(
        llm_api_key="x",
        chat_memory_enabled=False,
        chat_sticker_reply_enabled=False,
        chat_game_kb_enabled=False,
        chat_web_search_enabled=False,
        chat_hero_look_enabled=False,
        tools_enabled=False,
        chat_heat_debounce_sec=0.05,
        chat_at_reaction_sec=(0.0, 0.0),
        chat_speak_min_gap_sec=(0.0, 0.0),
        chat_glance_idle_sec=(1500.0, 3600.0),
        chat_glance_chat_sec=(20.0, 40.0),
        chat_glance_focus_sec=(3.0, 8.0),
    )
    base.update(kwargs)
    return Settings(**base)


@pytest.mark.asyncio
async def test_scenario_glance_wait_then_at_then_due_judge():
    gid = f"scen{uuid.uuid4().hex[:8]}"
    log: list[str] = []

    async def fake_llm(messages, settings, *, abort_event=None):
        content = messages[-1].get("content")
        text = content if isinstance(content, str) else str(content)
        if "【要不要接话" in text:
            log.append("JUDGE")
            if "火锅" in text:
                return '{"action":"reply"}'
            return '{"action":"silent"}'
        log.append("PERSONA")
        # 当前句优先：【当前消息】之后（避免 transcript 旧句干扰）
        cur = text.split("【当前消息】")[-1] if "【当前消息】" in text else text
        if "闭嘴" in cur or "不聊了" in cur:
            return '{"engagement":"leave","replies":[]}'
        if "火锅" in cur:
            return '{"engagement":"hold","replies":[{"type":"text","text":"火锅冲！"}]}'
        if "你好" in cur:
            return '{"engagement":"hold","replies":[{"type":"text","text":"嗨，我在~"}]}'
        return '{"engagement":"hold","replies":[{"type":"text","text":"嗯"}]}'

    mgr = reset_mainline_manager_for_tests(
        MainlineManager(settings=_settings(), llm_complete=fake_llm)
    )
    save_heat(gid, HeatState(attention=0.12))

    r = await mgr.handle(_req(gid, "今天天气真好"))
    assert r.reason == "glance_wait"
    assert "JUDGE" not in log and "PERSONA" not in log
    heat = load_heat(gid)
    assert heat.next_glance_at > 0

    r = await mgr.handle(_req(gid, "悠悠你好", at_bot=True, user_id="100"))
    assert r.reason == "hold"
    pending = await _wait_pending(mgr, gid)
    assert pending and "嗨" in (pending.replies[0].text or "")
    assert log.count("PERSONA") == 1
    heat = load_heat(gid)
    assert heat.partner_id == "100"
    assert heat.attention >= 0.5
    assert heat.pending_at is False

    # away 且未到进场点：路人只 glance_wait
    att_before = load_heat(gid).attention
    heat = load_heat(gid)
    heat.session = "away"
    heat.dwell_until = 0.0
    heat.next_glance_at = time_future(heat, 3600)
    heat.had_interaction_this_dwell = False
    save_heat(gid, heat)
    mgr.get(f"group:{gid}:bot:2").heat = None
    p_before = log.count("PERSONA")
    r = await mgr.handle(_req(gid, "楼上说得对", user_id="999", nick="路人"))
    assert r.reason == "glance_wait"
    assert log.count("PERSONA") == p_before
    assert load_heat(gid).attention <= att_before + 0.01

    # 进场到期 → dwelling + 快判 reply
    heat = load_heat(gid)
    heat.session = "away"
    heat.next_glance_at = 1.0
    heat.last_speak_at = 0.0
    save_heat(gid, heat)
    mgr.get(f"group:{gid}:bot:2").heat = None
    mgr.drain_pending(f"group:{gid}:bot:2")
    r = await mgr.handle(_req(gid, "谁要吃火锅", user_id="50"))
    assert r.reason == "hold"
    pending = await _wait_pending(mgr, gid)
    assert pending and "火锅" in (pending.replies[0].text or "")
    assert "JUDGE" in log
    assert load_heat(gid).session == "dwelling"

    # leave
    r = await mgr.handle(_req(gid, "行了不聊了你闭嘴", at_bot=True, user_id="100"))
    assert r.reason == "hold"
    heat = None
    for _ in range(40):
        await asyncio.sleep(0.05)
        heat = load_heat(gid)
        if heat.attention <= 0.15 and not heat.partner_id:
            break
    assert mgr.drain_pending(f"group:{gid}:bot:2") is None
    assert heat is not None
    assert heat.attention <= 0.15
    assert heat.partner_id == ""


def time_future(heat: HeatState, delta: float) -> float:
    import time

    return time.time() + delta


@pytest.mark.asyncio
async def test_scenario_due_judge_silent_reschedules():
    gid = f"sil{uuid.uuid4().hex[:8]}"

    async def fake_llm(messages, settings, *, abort_event=None):
        content = str(messages[-1].get("content") or "")
        if "【要不要接话" in content:
            return '{"action":"silent"}'
        return '{"engagement":"hold","replies":[{"type":"text","text":"不该到这"}]}'

    mgr = reset_mainline_manager_for_tests(
        MainlineManager(settings=_settings(), llm_complete=fake_llm)
    )
    import time

    save_heat(
        gid,
        HeatState(attention=0.5, next_glance_at=1.0, pending_glance_span=30.0, last_human_at=time.time()),
    )
    r = await mgr.handle(_req(gid, "两人私聊别插", user_id="8", nick="乙"))
    assert r.reason == "heat_silent"
    heat = load_heat(gid)
    assert heat.session == "dwelling"
    # dwell 内 silent 不降 attention、不排 next
    assert abs(heat.attention - 0.5) < 1e-6


@pytest.mark.asyncio
async def test_speak_gap_between_decisions_not_after_at():
    """被 @ 不另加反应延迟；下一轮决定开口才等到 chatSpeakMinGapSec 左端。"""
    gid = f"at{uuid.uuid4().hex[:8]}"

    async def fake_llm(messages, settings, *, abort_event=None):
        return '{"engagement":"hold","replies":[{"type":"text","text":"到了"}]}'

    mgr = reset_mainline_manager_for_tests(
        MainlineManager(
            settings=_settings(
                chat_at_reaction_sec=(2.0, 8.0),
                chat_speak_min_gap_sec=(0.45, 0.45),
                chat_heat_debounce_sec=0.05,
            ),
            llm_complete=fake_llm,
        )
    )
    import time

    t0 = time.time()
    r = await mgr.handle(_req(gid, "悠悠", at_bot=True))
    assert r.reason == "hold"
    pending = await _wait_pending(mgr, gid, timeout=2.0)
    assert pending and pending.replies
    assert time.time() - t0 < 1.0
    decide = load_heat(gid).last_decide_at
    assert decide > 0
    r = await mgr.handle(_req(gid, "再叫一次", at_bot=True))
    assert r.reason == "hold"
    pending2 = await _wait_pending(mgr, gid, timeout=2.0)
    assert pending2 and pending2.replies
    assert load_heat(gid).last_decide_at - decide >= 0.40
