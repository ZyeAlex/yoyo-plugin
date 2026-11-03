import pytest

from src.chat.mainline import MainlineManager
from src.chat.schema import ChatHints, ChatRequest, SessionInfo
from src.core.settings import Settings


def _req() -> ChatRequest:
    return ChatRequest(
        request_id="g1",
        session=SessionInfo(
            session_id="group:gk1:bot:2",
            group_id="gk1",
            bot_id="2",
            group_name="蓝色星原闲聊",
        ),
        message={
            "user_id": "1",
            "sender": {"nickname": "t"},
            "message": [{"type": "text", "text": "嗨"}],
            "raw_message": "嗨",
        },
        recent=[],
        hints=ChatHints(at_bot=True, wake_word=False, reply_to_bot=False),
    )


@pytest.mark.asyncio
async def test_build_messages_includes_game_l0_direct():
    settings = Settings(chat_game_kb_enabled=True, chat_memory_enabled=False)
    mgr = MainlineManager(settings=settings)
    req = _req()
    ml = mgr.get(req.session.session_id, group_id=req.session.group_id)
    messages = await mgr._build_messages(req, ml, "嗨")
    sys = messages[0]["content"]
    assert "【星原世界观】" in sys
    assert "寒悠悠" in sys
    assert '"type":"lookup"' in sys
    assert '"type":"expand"' in sys


@pytest.mark.asyncio
async def test_build_messages_skips_game_l0_when_disabled():
    settings = Settings(chat_game_kb_enabled=False, chat_memory_enabled=False)
    mgr = MainlineManager(settings=settings)
    req = _req()
    ml = mgr.get(req.session.session_id, group_id=req.session.group_id)
    messages = await mgr._build_messages(req, ml, "嗨")
    sys = messages[0]["content"]
    # persona 正文会提到【星原世界观】字样；关 KB 时不应注入真实 L0 块 / 工具面
    assert "【悠悠自己｜图鉴" not in sys
    assert "【图鉴工具｜本轮可声明】" not in sys
    assert '纪律:游戏事实以本块与【工具结果】为准' not in sys


@pytest.mark.asyncio
async def test_build_messages_hides_xingyuan_tools_outside_named_groups():
    settings = Settings(chat_game_kb_enabled=True, chat_memory_enabled=False)
    mgr = MainlineManager(settings=settings)
    req = _req()
    req.session.group_name = "随便聊聊"
    ml = mgr.get(req.session.session_id, group_id=req.session.group_id)
    messages = await mgr._build_messages(req, ml, "嗨")
    sys = messages[0]["content"]
    assert "群名：随便聊聊" in sys
    assert "作废" not in sys
    assert "【图鉴工具｜本轮可声明】" not in sys
    assert "【外观工具｜本轮可声明】" not in sys
    assert "图鉴工具（必须会用）" not in sys
    assert "指令前缀是" not in sys
    assert '"type":"lookup"' not in sys
    assert "【别人的指令】" in sys
    assert "别@我" not in sys
    assert '"replies":[]' in sys


@pytest.mark.asyncio
async def test_xingyuan_group_does_not_get_outsider_command_hint():
    settings = Settings(chat_game_kb_enabled=True, chat_memory_enabled=False)
    mgr = MainlineManager(settings=settings)
    req = _req()
    ml = mgr.get(req.session.session_id, group_id=req.session.group_id)
    messages = await mgr._build_messages(req, ml, "嗨")
    sys = messages[0]["content"]
    assert "【别人的指令】" not in sys
    assert "指令前缀是" in sys
