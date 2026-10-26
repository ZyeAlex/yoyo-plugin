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


def _req(*, request_id: str, text: str, at_bot: bool = False, wake: bool = False) -> ChatRequest:
    return ChatRequest(
        request_id=request_id,
        session=SessionInfo(session_id="group:1:bot:2", group_id="1", bot_id="2"),
        message={
            "user_id": "100",
            "sender": {"nickname": "测试"},
            "raw_message": text,
            "message": [{"type": "text", "text": text}],
        },
        recent=[],
        hints=ChatHints(at_bot=at_bot, wake_word=wake),
    )


@pytest.mark.asyncio
async def test_skip_without_trigger():
    settings = Settings(llm_api_key="x")
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=_fake_llm))
    data = await mgr.handle(_req(request_id="1", text="今天吃什么"))
    assert data.action == "skip"
    assert data.reason == "no_trigger"


@pytest.mark.asyncio
async def test_reply_on_at():
    settings = Settings(llm_api_key="x")
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=_fake_llm))
    data = await mgr.handle(_req(request_id="2", text="你好", at_bot=True))
    assert data.action == "reply"
    assert data.replies and data.replies[0].text == "你好呀"
    assert data.turn_gen >= 1


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
    # 第二轮应能正常回复或至少拿到更新后的 turn
    assert second.action in {"reply", "skip"}
    if second.action == "reply":
        assert second.replies
    assert second.turn_gen >= 1
