import asyncio

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
async def test_skip_without_trigger():
    settings = Settings(llm_api_key="x", proactive_enabled=False)
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=_fake_llm))
    data = await mgr.handle(_req(request_id="1", text="今天吃什么随便聊聊长长长长长长长"))
    assert data.action == "skip"


@pytest.mark.asyncio
async def test_reply_on_at():
    settings = Settings(llm_api_key="x")
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=_fake_llm))
    data = await mgr.handle(_req(request_id="2", text="你好", at_bot=True))
    assert data.action == "reply"
    assert data.replies and data.replies[0].text == "你好呀"


@pytest.mark.asyncio
async def test_thinking_interrupt():
    settings = Settings(llm_api_key="x", interrupt_enabled=True)
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=_slow_llm))

    first = asyncio.create_task(mgr.handle(_req(request_id="a", text="第一句", at_bot=True)))
    await asyncio.sleep(0.05)
    second = await mgr.handle(_req(request_id="b", text="打断你", at_bot=True))
    first_result = await first

    assert first_result.action == "skip" or first_result.aborted or first_result.reason in {
        "aborted",
        "llm",
    }
    assert second.action in {"reply", "skip"}
    assert second.turn_gen >= 1


@pytest.mark.asyncio
async def test_proactive_question_replies():
    settings = Settings(llm_api_key="x", proactive_enabled=True, proactive_cooldown_sec=0)
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=_fake_llm))
    data = await mgr.handle(_req(request_id="p", text="晚上吃什么好呢？"))
    assert data.action == "reply"
    assert data.reason == "proactive_question"


@pytest.mark.asyncio
async def test_draw_job_ack_and_outbox():
    settings = Settings(
        llm_api_key="x",
        tools_enabled=True,
        draw_mock_delay_sec=0.6,
        proactive_enabled=True,
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=_narrate_llm))

    start = await mgr.handle(_req(request_id="d1", text="帮我画一只猫", at_bot=True, user_id="100", nick="A"))
    assert start.action == "reply"
    assert start.reason == "tool_started"
    assert start.busy and start.busy.tools

    busy = await mgr.handle(
        _req(request_id="d2", text="你能帮我查攻略吗", at_bot=True, user_id="200", nick="B")
    )
    assert busy.action == "ack_busy"

    # 等 mock 画画完成并写入 outbox
    for _ in range(40):
        await asyncio.sleep(0.1)
        pending = mgr.drain_pending("group:1:bot:2")
        if pending and pending.action == "reply" and pending.replies:
            texts = " ".join(r.text or "" for r in pending.replies)
            assert "画好" in texts or "忙完" in texts or "给你" in texts
            return
    raise AssertionError("tool_done outbox not ready")
