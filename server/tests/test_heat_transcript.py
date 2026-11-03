import uuid

import pytest

from src.chat.mainline import MainlineManager, reset_mainline_manager_for_tests
from src.chat.outbound import sanitize_outgoing
from src.chat.schema import ChatHints, ChatRequest, SessionInfo
from src.chat.llm import parse_persona_json
from src.chat.temperature import (
    HeatState,
    apply_engagement,
    batch_need,
    enter_engaged,
    in_focus,
    is_engaged,
    mark_leave,
    on_incoming,
    smooth,
)
from src.chat.trace import load_trace, shrink
from src.chat.transcript import load_transcript_lines, render_cq_string, transcript_line
from src.core.settings import Settings


def test_batch_need_follows_talk_value():
    assert batch_need(0.1) == 10
    assert batch_need(0.25) == 4
    assert batch_need(0.5) == 2
    assert batch_need(1.0) == 1


def test_shrink_drops_data_urls():
    out = shrink(
        {"content": [{"type": "image_url", "image_url": {"url": "data:image/png;base64," + "a" * 800}}]}
    )
    url = out["content"][0]["image_url"]["url"]
    assert str(url).startswith("[omitted")
    assert "aaaa" not in str(url)


def test_smooth_moves_slowly():
    assert smooth(0.15, 1.0) == pytest.approx(0.2775, abs=1e-3)


def test_leave_sets_idle_min_heat():
    state = HeatState(temperature=0.9, mode="engaged", partner_id="1", engaged_until=9999)
    mark_leave(state)
    assert state.temperature == 0.1
    assert state.mode == "idle"
    assert state.partner_id == ""
    assert state.focus_user_ids == []
    assert batch_need(state.temperature) == 10


def test_enter_engaged_shim_writes_partner():
    state = HeatState(attention=0.2, mode="idle")
    enter_engaged(state, now=1000.0, user_id="100", engaged_sec=45.0)
    assert state.partner_id == "100"
    assert in_focus(state, "100")
    assert is_engaged(state, 1000.0)
    assert state.attention >= 0.85


def test_apply_engagement_down_drops_attention():
    state = HeatState(attention=0.8, partner_id="100")
    assert apply_engagement(state, "down", now=1000.0, user_id="100") == "down"
    assert state.attention == pytest.approx(0.65)
    assert state.partner_id == "100"


def test_soft_before_due_is_batch_keeps_partner_field():
    """路人/partner 软消息在未到期时同等 batch；partner 只写不读。"""
    state = HeatState(
        attention=0.5,
        partner_id="100",
        next_glance_at=5000.0,
        pending_glance_span=40.0,
    )
    kind = on_incoming(state, now=1000.0, hard=False, user_id="999")
    assert kind == "batch"
    assert state.partner_id == "100"
    assert on_incoming(state, now=1001.0, hard=False, user_id="100") == "batch"


def test_due_soft_is_judge():
    state = HeatState(
        attention=0.5,
        next_glance_at=1000.0,
        pending_glance_span=30.0,
        last_human_at=990.0,
    )
    assert on_incoming(state, now=1000.0, hard=False, user_id="100") == "judge"


def test_hard_is_reply():
    state = HeatState(next_glance_at=99999.0)
    assert on_incoming(state, now=1000.0, hard=True, user_id="100") == "reply"
    assert state.partner_id == "100"


def test_pointed_elsewhere_false_when_mentions_bot():
    from src.chat.mainline import _pointed_elsewhere
    from src.chat.schema import ChatHints, ChatRequest, SessionInfo

    req = ChatRequest(
        request_id="p1",
        session=SessionInfo(session_id="group:1:bot:2", group_id="1", bot_id="2"),
        message={
            "user_id": "100",
            "raw_message": "@塔菲 悠悠刚才说啥",
            "message": [
                {"type": "at", "qq": "999"},
                {"type": "text", "text": " 悠悠刚才说啥"},
            ],
        },
        recent=[],
        hints=ChatHints(at_bot=False, wake_word=False, reply_to_bot=False),
    )
    assert _pointed_elsewhere(req, ["悠悠", "小悠"]) is False

    req2 = ChatRequest(
        request_id="p2",
        session=SessionInfo(session_id="group:1:bot:2", group_id="1", bot_id="2"),
        message={
            "user_id": "100",
            "raw_message": "@塔菲 一起吃饭",
            "message": [
                {"type": "at", "qq": "999"},
                {"type": "text", "text": " 一起吃饭"},
            ],
        },
        recent=[],
        hints=ChatHints(at_bot=False, wake_word=False, reply_to_bot=False),
    )
    assert _pointed_elsewhere(req2, ["悠悠", "小悠"]) is True


def test_soft_before_due_stays_batch():
    state = HeatState(attention=0.1, next_glance_at=9999.0, pending_glance_span=60.0)
    kinds = [
        on_incoming(state, now=1000 + i, hard=False, user_id="1", debounce_sec=0)
        for i in range(10)
    ]
    assert kinds == ["batch"] * 10
    state.next_glance_at = 1000.0
    assert on_incoming(state, now=1010.0, hard=False, user_id="1") == "judge"


def test_parse_persona_json_reads_engagement():
    bubbles, eng = parse_persona_json(
        '{"engagement":"down","replies":[{"type":"text","text":"行吧"}]}',
        max_replies=1,
    )
    assert eng == "down"
    assert bubbles[0]["text"] == "行吧"
    empty, e2 = parse_persona_json('{"engagement":"hold","replies":[]}')
    assert empty == []
    assert e2 == "hold"


def test_parse_persona_json_drops_non_json_and_stage_direction():
    leak = (
        '用户说"性格还设定成这么可爱"，悠悠要不承认是设定，嫌弃着回。短句。\n\n'
        '可以回：什么设定，我本来就这样。或者"切，装什么懂"。\n\n'
        "用一句，短。可带表情s1。"
    )
    bubbles, eng = parse_persona_json(leak)
    assert bubbles == []
    assert eng == "hold"

    wrapped = '先想一下\n{"engagement":"hold","replies":[{"type":"text","text":"切，装什么懂"}]}'
    ok, _ = parse_persona_json(wrapped)
    assert ok and ok[0]["text"] == "切，装什么懂"

    bad_bubble, _ = parse_persona_json(
        '{"engagement":"hold","replies":[{"type":"text","text":"可以回：哼一声就行"}]}'
    )
    assert bad_bubble == []


def test_render_cq_at_uses_name():
    raw = "夜夜你乱说！哼~[CQ:at,qq=739219622,name=夜夜]"
    assert render_cq_string(raw) == "夜夜你乱说！哼~@夜夜"
    assert "[CQ:" not in render_cq_string("[CQ:image,file=a.jpg] 看")


def test_render_cq_forward_placeholder():
    raw = "[CQ:forward,id=8Y9r8totWW9jHqcCNbiqatuz1DPB2/fTupZIr0hb3mPeVZUXnkdah2QaNWNOUYzt]"
    assert render_cq_string(raw) == "[转发的聊天记录]"


def test_transcript_line_keeps_expanded_forward():
    body = "[转发的聊天记录]\n塔菲: 你好\n夜夜: 在呢"
    line = transcript_line(
        {
            "user_id": "2247232908",
            "sender": {"nickname": "可爱の肥鱼", "role": "member"},
            "message": [{"type": "text", "text": body}],
            "raw_message": body,
        }
    )
    assert "转发的聊天记录" in line
    assert "塔菲: 你好" in line
    assert "夜夜: 在呢" in line


def test_transcript_line_bare_forward_seg():
    line = transcript_line(
        {
            "user_id": "1",
            "sender": {"nickname": "甲", "role": "member"},
            "message": [{"type": "forward", "id": "abc"}],
            "raw_message": "[CQ:forward,id=abc]",
        }
    )
    assert "[转发的聊天记录]" in line
    assert "[CQ:" not in line


def test_transcript_line_keeps_at_name_and_photo():
    line = transcript_line(
        {
            "user_id": "10001",
            "sender": {"nickname": "塔菲", "role": "member"},
            "message": [
                {"type": "text", "text": "悠悠评价一下"},
                {"type": "at", "qq": "739219622", "name": "夜夜"},
                {"type": "image", "url": "https://x/a.jpg", "sub_type": 0},
            ],
        }
    )
    assert line.startswith("10001 群成员 塔菲:")
    assert "@夜夜" in line
    assert "[图片]" in line
    assert "[CQ:" not in line


def test_sanitize_outgoing_lifts_cq_at():
    text, mention = sanitize_outgoing("哼~[CQ:at,qq=739219622,name=夜夜]", None)
    assert mention == "739219622"
    assert text == "哼~"
    assert "[CQ:" not in text


def test_sanitize_drops_nickname_mention():
    text, mention = sanitize_outgoing("嗨", "夜夜")
    assert text == "嗨"
    assert mention is None


def test_sanitize_maps_nickname_to_qq():
    known = {"夜夜": "739219622", "739219622": "739219622"}
    text, mention = sanitize_outgoing("嗨", "夜夜", known=known)
    assert text == "嗨"
    assert mention == "739219622"


def test_sanitize_drops_garbage_mention():
    _, mention = sanitize_outgoing("嗯", "空气")
    assert mention is None
    _, mention2 = sanitize_outgoing("嗯", "@某人")
    assert mention2 is None


async def _await_outbox(mgr: MainlineManager, gid: str, timeout: float = 3.0):
    import asyncio

    sid = f"group:{gid}:bot:2"
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        pending = mgr.drain_pending(sid)
        if pending and pending.action == "reply" and pending.replies:
            return pending
        await asyncio.sleep(0.05)
    return None


def _req(gid: str, text: str, *, at_bot: bool = False, user_id: str = "100", nick: str = "塔菲") -> ChatRequest:
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


@pytest.mark.asyncio
async def test_earlier_lines_are_in_prompt_when_named():
    gid = f"ctx{uuid.uuid4().hex[:8]}"
    captured: list[str] = []

    async def fake_llm(messages, settings, *, abort_event=None):
        content = messages[-1].get("content")
        captured.append(content if isinstance(content, str) else str(content))
        return '{"engagement":"hold","replies":[{"type":"text","text":"菜市场好着呢"}]}'

    settings = Settings(
        llm_api_key="x",
        chat_memory_enabled=False,
        chat_sticker_reply_enabled=False,
        chat_heat_debounce_sec=0.05,
        chat_at_reaction_sec=(0.0, 0.0),
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=fake_llm))
    first = await mgr.handle(_req(gid, "菜市场还能好吗"))
    assert first.action == "skip"
    assert first.reason == "glance_wait"
    second = await mgr.handle(_req(gid, "悠悠你不懂", at_bot=True))
    assert second.reason == "hold"
    pending = await _await_outbox(mgr, gid)
    assert pending is not None
    assert any("菜市场还能好吗" in blob for blob in captured)


@pytest.mark.asyncio
async def test_model_cq_at_becomes_mention():
    gid = f"cq{uuid.uuid4().hex[:8]}"

    async def fake_llm(messages, settings, *, abort_event=None):
        return '{"engagement":"hold","replies":[{"type":"text","text":"哼~[CQ:at,qq=739219622,name=夜夜]"}]}'

    settings = Settings(
        llm_api_key="x",
        chat_memory_enabled=False,
        chat_sticker_reply_enabled=False,
        chat_heat_debounce_sec=0.05,
        chat_at_reaction_sec=(0.0, 0.0),
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=fake_llm))
    data = await mgr.handle(_req(gid, "悠悠过来", at_bot=True))
    assert data.reason == "hold"
    pending = await _await_outbox(mgr, gid)
    assert pending is not None
    assert pending.replies[0].mention == "739219622"
    assert "[CQ:" not in (pending.replies[0].text or "")


@pytest.mark.asyncio
async def test_model_nickname_mention_mapped_from_sender():
    gid = f"nick{uuid.uuid4().hex[:8]}"

    async def fake_llm(messages, settings, *, abort_event=None):
        return '{"engagement":"hold","replies":[{"type":"text","text":"在呢","mention":"塔菲"}]}'

    settings = Settings(
        llm_api_key="x",
        chat_memory_enabled=False,
        chat_sticker_reply_enabled=False,
        chat_heat_debounce_sec=0.05,
        chat_at_reaction_sec=(0.0, 0.0),
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=fake_llm))
    data = await mgr.handle(_req(gid, "悠悠过来", at_bot=True, user_id="10001", nick="塔菲"))
    assert data.reason == "hold"
    pending = await _await_outbox(mgr, gid)
    assert pending is not None
    assert pending.replies[0].mention == "10001"


@pytest.mark.asyncio
async def test_model_garbage_mention_stripped():
    gid = f"air{uuid.uuid4().hex[:8]}"

    async def fake_llm(messages, settings, *, abort_event=None):
        return '{"engagement":"hold","replies":[{"type":"text","text":"嗯","mention":"空气"}]}'

    settings = Settings(
        llm_api_key="x",
        chat_memory_enabled=False,
        chat_sticker_reply_enabled=False,
        chat_heat_debounce_sec=0.05,
        chat_at_reaction_sec=(0.0, 0.0),
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=fake_llm))
    data = await mgr.handle(_req(gid, "悠悠过来", at_bot=True))
    assert data.reason == "hold"
    pending = await _await_outbox(mgr, gid)
    assert pending is not None
    assert pending.replies[0].mention is None


@pytest.mark.asyncio
async def test_due_message_calls_judge_then_persona():
    gid = f"burst{uuid.uuid4().hex[:8]}"
    import time
    from src.chat.temperature import load_heat, save_heat

    calls = {"judge": 0, "persona": 0}

    async def fake_llm(messages, settings, *, abort_event=None):
        content = messages[-1].get("content")
        text = content if isinstance(content, str) else str(content)
        if "【要不要接话" in text:
            calls["judge"] += 1
            return '{"action":"reply"}'
        calls["persona"] += 1
        return '{"engagement":"hold","replies":[{"type":"text","text":"吃火锅"}]}'

    settings = Settings(
        llm_api_key="x",
        chat_memory_enabled=False,
        chat_sticker_reply_enabled=False,
        chat_heat_debounce_sec=0.05,
        chat_at_reaction_sec=(0.0, 0.0),
        chat_speak_min_gap_sec=(0.0, 0.0),
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=fake_llm))
    # 冷启动首条只排期
    first = await mgr.handle(_req(gid, "随便聊聊0"))
    assert first.reason == "glance_wait"
    save_heat(
        gid,
        HeatState(
            attention=0.5,
            next_glance_at=1.0,
            pending_glance_span=30.0,
            last_human_at=time.time(),
        ),
    )
    mgr.get(f"group:{gid}:bot:2").heat = None
    last = await mgr.handle(_req(gid, "谁要吃火锅"))
    assert last.reason == "hold"
    assert calls["judge"] == 1
    pending = await _await_outbox(mgr, gid)
    assert pending is not None
    assert calls["persona"] == 1
    assert pending.replies[0].text == "吃火锅"
    heat = load_heat(gid)
    assert heat.attention >= 0.5
    assert heat.session == "dwelling"
    # dwell 内响应结束不排 next_glance_at
    assert heat.next_glance_at == 1.0


@pytest.mark.asyncio
async def test_idle_judge_silent_marks_silent_without_persona():
    gid = f"silent{uuid.uuid4().hex[:8]}"
    import time
    from src.chat.temperature import load_heat, save_heat

    calls = {"persona": 0}

    async def fake_llm(messages, settings, *, abort_event=None):
        content = messages[-1].get("content")
        text = content if isinstance(content, str) else str(content)
        if "【要不要接话" in text:
            return '{"action":"silent"}'
        calls["persona"] += 1
        return '{"engagement":"hold","replies":[{"type":"text","text":"不该到这"}]}'

    settings = Settings(llm_api_key="x", chat_memory_enabled=False, chat_sticker_reply_enabled=False)
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=fake_llm))
    save_heat(
        gid,
        HeatState(
            attention=0.5,
            next_glance_at=1.0,
            pending_glance_span=30.0,
            last_human_at=time.time(),
        ),
    )
    last = await mgr.handle(_req(gid, "旁听0"))
    assert last is not None
    assert last.reason == "heat_silent"
    assert calls["persona"] == 0
    heat = load_heat(gid)
    assert heat.silent_streak >= 1
    assert heat.session == "dwelling"
    assert abs(heat.attention - 0.5) < 1e-6


@pytest.mark.asyncio
async def test_at_then_followup_needs_glance_due_and_judge():
    """away 到期进场仍走快判；未到期仍 glance_wait。"""
    import time
    from src.chat.temperature import load_heat, save_heat

    gid = f"follow{uuid.uuid4().hex[:8]}"
    calls = {"persona": 0, "judge": 0}

    async def fake_llm(messages, settings, *, abort_event=None):
        content = messages[-1].get("content")
        text = content if isinstance(content, str) else str(content)
        if "【要不要接话" in text:
            calls["judge"] += 1
            return '{"action":"reply"}'
        calls["persona"] += 1
        return '{"engagement":"hold","replies":[{"type":"text","text":"嗯我在听"}]}'

    settings = Settings(
        llm_api_key="x",
        chat_memory_enabled=False,
        chat_sticker_reply_enabled=False,
        chat_heat_debounce_sec=0.05,
        chat_at_reaction_sec=(0.0, 0.0),
        chat_speak_min_gap_sec=(0.0, 0.0),
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=fake_llm))
    first = await mgr.handle(_req(gid, "悠悠你好", at_bot=True, user_id="100"))
    assert first.reason == "hold"
    first_out = await _await_outbox(mgr, gid)
    assert first_out is not None
    assert calls["persona"] == 1

    # away 未到进场点 → glance_wait
    heat = load_heat(gid)
    heat.session = "away"
    heat.dwell_until = 0.0
    heat.next_glance_at = time.time() + 3600
    save_heat(gid, heat)
    mgr.get(f"group:{gid}:bot:2").heat = None
    early = await mgr.handle(_req(gid, "然后呢你怎么看", user_id="100"))
    assert early.reason == "glance_wait"

    heat = load_heat(gid)
    heat.session = "away"
    heat.next_glance_at = 1.0
    heat.last_speak_at = 0.0
    save_heat(gid, heat)
    mgr.get(f"group:{gid}:bot:2").heat = None
    second = await mgr.handle(_req(gid, "然后呢你怎么看", user_id="100"))
    assert second.reason == "hold"
    pending = await _await_outbox(mgr, gid)
    assert pending is not None
    assert calls["judge"] >= 1
    assert calls["persona"] >= 2


@pytest.mark.asyncio
async def test_dwelling_soft_skips_fast_judge_to_persona():
    """热态 dwelling：软消息不经快判，直进人设。"""
    import time
    from src.chat.temperature import load_heat, save_heat

    gid = f"dwellsoft{uuid.uuid4().hex[:8]}"
    calls = {"judge": 0, "persona": 0}

    async def fake_llm(messages, settings, *, abort_event=None):
        content = messages[-1].get("content")
        text = content if isinstance(content, str) else str(content)
        if "【要不要接话" in text:
            calls["judge"] += 1
            return '{"action":"silent"}'
        calls["persona"] += 1
        return '{"engagement":"hold","replies":[{"type":"text","text":"画好了"}]}'

    settings = Settings(
        llm_api_key="x",
        chat_memory_enabled=False,
        chat_sticker_reply_enabled=False,
        chat_heat_debounce_sec=0.05,
        chat_at_reaction_sec=(0.0, 0.0),
        chat_speak_min_gap_sec=(0.0, 0.0),
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=fake_llm))
    save_heat(
        gid,
        HeatState(
            attention=0.8,
            session="dwelling",
            dwell_until=time.time() + 600,
            next_glance_at=0.0,
            last_human_at=time.time(),
        ),
    )
    out = await mgr.handle(_req(gid, "画张源千代洗澡的图"))
    assert out.reason == "hold"
    pending = await _await_outbox(mgr, gid)
    assert pending is not None
    assert calls["judge"] == 0
    assert calls["persona"] == 1
    assert pending.replies[0].text == "画好了"


@pytest.mark.asyncio
async def test_bystander_before_due_is_glance_wait():
    gid = f"bye{uuid.uuid4().hex[:8]}"
    import time
    from src.chat.temperature import load_heat, save_heat

    calls = {"n": 0}

    async def fake_llm(messages, settings, *, abort_event=None):
        content = str(messages[-1].get("content") or "")
        if "【要不要接话" in content:
            return '{"action":"reply"}'
        calls["n"] += 1
        return '{"engagement":"hold","replies":[{"type":"text","text":"嗨"}]}'

    settings = Settings(
        llm_api_key="x",
        chat_memory_enabled=False,
        chat_sticker_reply_enabled=False,
        chat_at_reaction_sec=(0.0, 0.0),
        chat_speak_min_gap_sec=(0.0, 0.0),
        chat_heat_debounce_sec=0.05,
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=fake_llm))
    await mgr.handle(_req(gid, "悠悠来", at_bot=True, user_id="100"))
    await _await_outbox(mgr, gid)
    n_after_at = calls["n"]
    heat = load_heat(gid)
    heat.session = "away"
    heat.dwell_until = 0.0
    heat.next_glance_at = time.time() + 3600
    save_heat(gid, heat)
    mgr.get(f"group:{gid}:bot:2").heat = None
    data = await mgr.handle(_req(gid, "路人甲路过", user_id="999", nick="路人"))
    assert data.reason == "glance_wait"
    assert calls["n"] == n_after_at


@pytest.mark.asyncio
async def test_empty_reply_skips_send_but_can_leave():
    gid = f"empty{uuid.uuid4().hex[:8]}"
    from src.chat.temperature import load_heat

    async def fake_llm(messages, settings, *, abort_event=None):
        return '{"engagement":"leave","replies":[]}'

    settings = Settings(
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
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=fake_llm))
    data = await mgr.handle(_req(gid, "悠悠闭嘴", at_bot=True, user_id="100"))
    assert data.reason == "hold"
    import asyncio

    heat = None
    for _ in range(40):
        await asyncio.sleep(0.05)
        heat = load_heat(gid)
        if heat.attention <= 0.15 and heat.session == "away":
            break
    assert mgr.drain_pending(f"group:{gid}:bot:2") is None
    assert heat is not None
    assert heat.mode == "idle"
    assert heat.attention <= 0.15
    assert heat.temperature == 0.1


@pytest.mark.asyncio
async def test_pure_image_is_archived():
    gid = f"img{uuid.uuid4().hex[:8]}"
    settings = Settings(llm_api_key="x", chat_memory_enabled=False)
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=None))

    async def fake_llm(messages, settings, *, abort_event=None):
        return '{"engagement":"hold","replies":[{"type":"text","text":"嗯"}]}'

    mgr._llm_complete = fake_llm
    req = ChatRequest(
        request_id="img",
        session=SessionInfo(session_id=f"group:{gid}:bot:2", group_id=gid, bot_id="2"),
        message={
            "user_id": "100",
            "sender": {"nickname": "塔菲"},
            "raw_message": "[CQ:image,file=a.jpg]",
            "message": [{"type": "image", "url": "https://x/a.jpg", "sub_type": 0}],
        },
        recent=[],
        hints=ChatHints(),
    )
    data = await mgr.handle(req)
    assert data.action == "skip"
    lines = load_transcript_lines(gid)
    assert any("[图片]" in line and "塔菲:" in line and "100" in line for line in lines)
