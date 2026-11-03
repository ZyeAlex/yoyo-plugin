import asyncio
import uuid

import pytest

from src.chat.mainline import MainlineManager, reset_mainline_manager_for_tests
from src.chat.schema import ChatHints, ChatRequest, SessionInfo
from src.core.settings import Settings


async def _fake_llm(messages, settings, *, abort_event=None):
    await asyncio.sleep(0.05)
    if abort_event is not None and abort_event.is_set():
        from src.chat.llm import LLMError

        raise LLMError("aborted")
    return '{"replies":[{"type":"text","text":"你好呀"}]}'


async def _slow_llm(messages, settings, *, abort_event=None):
    for _ in range(50):
        await asyncio.sleep(0.02)
        if abort_event is not None and abort_event.is_set():
            from src.chat.llm import LLMError

            raise LLMError("aborted")
    return '{"replies":[{"type":"text","text":"慢回复"}]}'


async def _narrate_llm(messages, settings, *, abort_event=None):
    content = str(messages[-1].get("content") or "")
    if "异步工具刚完成" in content or "主线任务" in content:
        return (
            '{"replies":['
            '{"type":"text","text":"终于画好啦，给你","mention":"100"},'
            '{"type":"text","text":"还在吗，忙完啦","mention":"200"}'
            "]}"
        )
    return '{"replies":[{"type":"text","text":"你好呀"}]}'


async def _draw_agent_llm(messages, settings, *, abort_event=None):
    content = str(messages[-1].get("content") or "")
    if "异步工具刚完成" in content or "主线任务" in content:
        return await _narrate_llm(messages, settings, abort_event=abort_event)
    # 正常聊天轮：agent 声明 draw（按当前用户句区分文生图/改图）
    if "赛博" in content:
        return (
            '{"replies":['
            '{"type":"text","text":"好，按你这张改！"},'
            '{"type":"draw","prompt":"赛博朋克风格"}'
            "]}"
        )
    return (
        '{"replies":['
        '{"type":"text","text":"好，稍等本公主画一只猫~"},'
        '{"type":"draw","prompt":"一只猫"}'
        "]}"
    )


async def _await_outbox(mgr: MainlineManager, sid: str = "group:1:bot:2", timeout: float = 3.0):
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        pending = mgr.drain_pending(sid)
        if pending and pending.action == "reply" and pending.replies:
            return pending
        await asyncio.sleep(0.05)
    return None


def _req(
    *,
    request_id: str,
    text: str,
    at_bot: bool = False,
    wake: bool = False,
    user_id: str = "100",
    nick: str = "测试",
) -> ChatRequest:
    return ChatRequest(
        request_id=request_id,
        session=SessionInfo(session_id="group:1:bot:2", group_id="1", bot_id="2"),
        message={
            "user_id": user_id,
            "sender": {"nickname": nick},
            "raw_message": text,
            "message": [{"type": "text", "text": text}],
        },
        recent=[],
        hints=ChatHints(at_bot=at_bot, wake_word=wake),
    )


@pytest.mark.asyncio
async def test_active_pure_media_can_reply():
    """@ + 纯图/表情不再 media_only，走热度硬触发。"""
    settings = Settings(
        llm_api_key="x",
        chat_heat_enabled=True,
        chat_memory_enabled=False,
        chat_heat_debounce_sec=0.05,
        chat_at_reaction_sec=(0.0, 0.0),
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=_fake_llm))
    req = ChatRequest(
        request_id="media-at",
        session=SessionInfo(session_id="group:1:bot:2", group_id="1", bot_id="2"),
        message={
            "user_id": "100",
            "sender": {"nickname": "测试"},
            "raw_message": "[图片]",
            "message": [{"type": "image", "url": "https://x/a.jpg"}],
        },
        recent=[],
        hints=ChatHints(at_bot=True),
    )
    data = await mgr.handle(req)
    assert data.reason == "hold"
    pending = await _await_outbox(mgr)
    assert pending is not None
    assert pending.action == "reply"


@pytest.mark.asyncio
async def test_non_active_pure_media_uses_heat_not_media_only():
    """非主动纯媒体不再 early no_trigger；由热度决定（常见 idle_batch）。"""
    settings = Settings(
        llm_api_key="x",
        chat_heat_enabled=True,
        proactive_enabled=True,
        chat_memory_enabled=False,
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=_fake_llm))
    req = ChatRequest(
        request_id="media-listen",
        session=SessionInfo(session_id="group:1:bot:2", group_id="1", bot_id="2"),
        message={
            "user_id": "100",
            "sender": {"nickname": "测试"},
            "raw_message": "[图片]",
            "message": [{"type": "image", "url": "https://x/a.jpg"}],
        },
        recent=[],
        hints=ChatHints(),
    )
    data = await mgr.handle(req)
    assert data.reason != "media_only"
    # 冷启动攒批：允许 skip，但不允许旧策略 C 的 media_only
    assert data.action in {"skip", "reply"}


@pytest.mark.asyncio
async def test_skip_without_trigger():
    settings = Settings(llm_api_key="x", proactive_enabled=False)
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=_fake_llm))
    data = await mgr.handle(_req(request_id="1", text="今天吃什么随便聊聊长长长长长长长"))
    assert data.action == "skip"


@pytest.mark.asyncio
async def test_reply_on_at():
    settings = Settings(
        llm_api_key="x",
        chat_heat_debounce_sec=0.05,
        chat_at_reaction_sec=(0.0, 0.0),
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=_fake_llm))
    data = await mgr.handle(_req(request_id="2", text="你好", at_bot=True))
    assert data.reason == "hold"
    pending = await _await_outbox(mgr)
    assert pending is not None
    assert pending.replies[0].text == "你好呀"


@pytest.mark.asyncio
async def test_thinking_interrupt():
    settings = Settings(
        llm_api_key="x",
        interrupt_enabled=True,
        chat_heat_debounce_sec=0.05,
        chat_at_reaction_sec=(0.0, 0.0),
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=_slow_llm))

    first = await mgr.handle(_req(request_id="a", text="第一句", at_bot=True))
    assert first.reason == "hold"
    await asyncio.sleep(0.08)  # 进入 thinking
    second = await mgr.handle(_req(request_id="b", text="打断你", at_bot=True))
    assert second.reason == "hold"
    pending = await _await_outbox(mgr, timeout=4.0)
    assert pending is not None
    assert pending.replies[0].text == "慢回复"


@pytest.mark.asyncio
async def test_proactive_question_replies():
    """冷启动时单条问句先记账，不立刻叫人设。"""
    gid = f"heatq{uuid.uuid4().hex[:8]}"
    settings = Settings(llm_api_key="x", proactive_enabled=True, chat_heat_enabled=True)
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=_fake_llm))
    data = await mgr.handle(
        _req(request_id="p", text="晚上吃什么好呢？").model_copy(
            update={"session": SessionInfo(session_id=f"group:{gid}:bot:2", group_id=gid, bot_id="2")}
        )
    )
    assert data.action == "skip"
    assert data.reason == "glance_wait"


@pytest.mark.asyncio
async def test_draw_job_ack_and_outbox():
    """agent 输出 type=draw → job；完成后 outbox。画的时候不再整线回「别急」。"""
    settings = Settings(
        llm_api_key="x",
        tools_enabled=True,
        draw_mock_delay_sec=0.6,
        proactive_enabled=True,
        chat_memory_enabled=False,
        chat_heat_enabled=False,
        chat_heat_debounce_sec=0.05,
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=_draw_agent_llm))
    start = await mgr.handle(_req(request_id="d1", text="帮我画一只猫", at_bot=True, user_id="100", nick="A"))
    assert start.reason == "hold"
    start_out = await _await_outbox(mgr)
    assert start_out is not None
    assert start_out.reason == "tool_started"
    assert start_out.busy and start_out.busy.tools
    assert start_out.replies and start_out.replies[0].text

    for _ in range(40):
        await asyncio.sleep(0.1)
        pending = mgr.drain_pending("group:1:bot:2")
        if pending and pending.action == "reply" and pending.replies:
            texts = " ".join(r.text or "" for r in pending.replies)
            assert "画好" in texts or "忙完" in texts or "给你" in texts
            return
    raise AssertionError("tool_done outbox not ready")


@pytest.mark.asyncio
async def test_second_draw_refused_while_one_runs():
    """已有一张在画时，再声明 draw 不新开 job。"""

    async def persona(messages, settings, *, abort_event=None):
        return '{"replies":[{"type":"text","text":"再来一张"},{"type":"draw","prompt":"第二张"}]}'

    settings = Settings(
        llm_api_key="x",
        tools_enabled=True,
        chat_memory_enabled=False,
        chat_heat_enabled=False,
        chat_heat_debounce_sec=0.05,
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=persona))
    gid = f"draw2{uuid.uuid4().hex[:8]}"
    sid = f"group:{gid}:bot:2"
    ml = mgr.get(sid, group_id=gid)
    ml.jobs.append(
        {"id": "j-edit", "name": "改图", "status": "running", "mode": "edit", "prompt": "飙车"}
    )
    ml.phase = "tool_running"
    data = await mgr.handle(
        _req(request_id="d2", text="再画一张", at_bot=True, user_id="200", nick="B").model_copy(
            update={"session": SessionInfo(session_id=sid, group_id=gid, bot_id="2")}
        )
    )
    assert data.action != "ack_busy"
    assert data.reason == "hold"
    out = await _await_outbox(mgr, sid, timeout=4.0)
    assert out is not None
    blob = " ".join(r.text or "" for r in out.replies)
    assert "上一张还在画" in blob
    assert "别急" not in blob
    assert [j["id"] for j in ml.jobs] == ["j-edit"]


@pytest.mark.asyncio
async def test_chat_while_draw_running():
    """改图进行中，@ 别的事走正常回复，不回「别急我正在改图」。"""

    async def persona(messages, settings, *, abort_event=None):
        return '{"replies":[{"type":"text","text":"禁言这事我接"}]}'

    settings = Settings(
        llm_api_key="x",
        tools_enabled=True,
        chat_memory_enabled=False,
        chat_heat_enabled=False,
        chat_heat_debounce_sec=0.05,
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=persona))
    gid = f"drawchat{uuid.uuid4().hex[:8]}"
    sid = f"group:{gid}:bot:2"
    ml = mgr.get(sid, group_id=gid)
    ml.jobs.append(
        {"id": "j-edit", "name": "改图", "status": "running", "mode": "edit", "prompt": "飙车"}
    )
    ml.phase = "tool_running"
    data = await mgr.handle(
        _req(request_id="mute", text="禁言我1min可以不", at_bot=True, user_id="200", nick="立奏").model_copy(
            update={"session": SessionInfo(session_id=sid, group_id=gid, bot_id="2")}
        )
    )
    assert data.action != "ack_busy"
    assert data.reason == "hold"
    out = await _await_outbox(mgr, sid, timeout=4.0)
    assert out is not None
    blob = " ".join(r.text or "" for r in out.replies)
    assert "禁言这事我接" in blob
    assert "别急" not in blob
    assert len(ml.blocking_jobs()) == 1


@pytest.mark.asyncio
async def test_draw_disabled_ignores_agent_draw_type():
    """tools 关闭时即使模型吐 draw 也当普通聊天（无 job）。"""
    settings = Settings(
        llm_api_key="x",
        tools_enabled=False,
        chat_heat_enabled=False,
        chat_memory_enabled=False,
        chat_heat_debounce_sec=0.05,
    )

    async def llm_with_draw(messages, settings, *, abort_event=None):
        return '{"replies":[{"type":"text","text":"好"},{"type":"draw","prompt":"猫"}]}'

    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=llm_with_draw))
    data = await mgr.handle(_req(request_id="d0", text="帮我画一只猫", at_bot=True))
    assert data.reason == "hold"
    pending = await _await_outbox(mgr)
    assert pending is not None
    assert pending.reason != "tool_started"
    assert pending.busy is None or not pending.busy.tools


@pytest.mark.asyncio
async def test_edit_with_image_via_agent_draw():
    settings = Settings(
        llm_api_key="x",
        tools_enabled=True,
        draw_mock_delay_sec=0.5,
        chat_memory_enabled=False,
        chat_vision_enabled=True,
        chat_heat_enabled=False,
        chat_heat_debounce_sec=0.05,
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=_draw_agent_llm))
    req = ChatRequest(
        request_id="edit1",
        session=SessionInfo(session_id="group:1:bot:2", group_id="1", bot_id="2"),
        message={
            "user_id": "100",
            "sender": {"nickname": "A"},
            "raw_message": "换成赛博朋克",
            "message": [
                {"type": "text", "text": "换成赛博朋克"},
                {"type": "image", "url": "https://x/a.jpg", "sub_type": 0},
            ],
        },
        recent=[],
        hints=ChatHints(at_bot=True),
    )
    data = await mgr.handle(req)
    assert data.reason == "hold"
    pending = await _await_outbox(mgr)
    assert pending is not None
    assert pending.reason == "tool_started"
    assert any("改" in (r.text or "") for r in pending.replies)


@pytest.mark.asyncio
async def test_skip_drains_stuck_outbox():
    """轮询漏掉的 tool_done：下一条即使 skip 也会顺带走图/字。"""
    from src.chat.schema import ReplyBubble

    settings = Settings(
        llm_api_key="x",
        proactive_enabled=True,
        chat_heat_enabled=True,
        chat_memory_enabled=False,
        chat_sticker_reply_enabled=False,
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=_fake_llm))
    sid = "group:outbox1:bot:2"
    ml = mgr.get(sid, group_id="outbox1")
    ml.push_outbox(
        9,
        [
            ReplyBubble(type="text", text="画好啦~"),
            ReplyBubble(type="image", path="/tmp/fake.jpg"),
        ],
        reason="tool_done",
    )
    # 无关键词 → 本会 idle_batch/skip，但应带出 outbox
    req = ChatRequest(
        request_id="o1",
        session=SessionInfo(session_id=sid, group_id="outbox1", bot_id="2"),
        message={
            "user_id": "100",
            "sender": {"nickname": "塔菲"},
            "raw_message": "图呢",
            "message": [{"type": "text", "text": "图呢"}],
        },
        recent=[],
        hints=ChatHints(at_bot=False),
    )
    data = await mgr.handle(req)
    assert data.action == "reply"
    assert data.reason == "tool_done"
    assert any(r.type == "image" for r in data.replies)
    assert mgr.drain_pending(sid) is None


@pytest.mark.asyncio
async def test_awaiting_outbox_keeps_busy():
    settings = Settings(llm_api_key="x")
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=_fake_llm))
    ml = mgr.get("group:busy1:bot:2", group_id="busy1")
    assert ml.busy_info() is None
    ml.awaiting_outbox = True
    busy = ml.busy_info()
    assert busy and busy.tools
    assert any(t.id == "deliver" for t in busy.tools)


@pytest.mark.asyncio
async def test_busy_while_speak_or_thinking():
    settings = Settings(llm_api_key="x")
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=_fake_llm))
    ml = mgr.get("group:busy2:bot:2", group_id="busy2")
    assert ml.busy_info() is None
    ml.phase = "thinking"
    busy = ml.busy_info()
    assert busy and any(t.id == "think" for t in busy.tools)
    ml.phase = "idle"

    async def _noop():
        await asyncio.sleep(60)

    task = asyncio.create_task(_noop())
    ml.speak_task = task
    busy2 = ml.busy_info()
    assert busy2 and any(t.id == "speak" for t in busy2.tools)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    ml.speak_task = None
    assert ml.busy_info() is None


@pytest.mark.asyncio
async def test_at_command_outside_xingyuan_is_silent():
    """非星原群里 @ 发指令：不进模型，空回。"""

    async def boom(messages, settings, *, abort_event=None):
        raise AssertionError("should not call llm")

    settings = Settings(llm_api_key="x", chat_memory_enabled=False, chat_heat_enabled=False)
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=boom))
    gid = f"cmd{uuid.uuid4().hex[:8]}"
    sid = f"group:{gid}:bot:2"
    req = _req(request_id="cmd", text="嘉明面板天赋换1-13-13", at_bot=True).model_copy(
        update={"session": SessionInfo(session_id=sid, group_id=gid, bot_id="2", group_name="原神萌新小窝")}
    )
    data = await mgr.handle(req)
    assert data.action == "skip"
    assert data.reason == "outsider_command"
    assert not data.replies


@pytest.mark.asyncio
async def test_llm_error_skips_without_reply():
    from src.chat.llm import LLMError

    async def fail(messages, settings, *, abort_event=None):
        raise LLMError("down")

    settings = Settings(llm_api_key="x", chat_memory_enabled=False, chat_heat_enabled=False)
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=fail))
    gid = f"llmerr{uuid.uuid4().hex[:8]}"
    sid = f"group:{gid}:bot:2"
    req = _req(request_id="err", text="在吗", at_bot=True).model_copy(
        update={"session": SessionInfo(session_id=sid, group_id=gid, bot_id="2", group_name="原神萌新小窝")}
    )
    ml = mgr.get(sid, group_id=gid)
    data = await mgr._generate(req, ml, "在吗", 1, asyncio.Event(), reason="at_bot")
    assert data.action == "skip"
    assert data.reason == "llm_error"
    assert not data.replies
