import pytest

from src.chat.mainline import MainlineManager
from src.chat.schema import ChatHints, ChatRequest, SessionInfo
from src.chat.tts.voice import save_default_voice
from src.core.settings import Settings


def _req(group_name: str = "随便聊聊", group_id: str = "g1") -> ChatRequest:
    return ChatRequest(
        request_id="t1",
        session=SessionInfo(
            session_id=f"group:{group_id}:bot:2",
            group_id=group_id,
            bot_id="2",
            group_name=group_name,
        ),
        message={
            "user_id": "1",
            "sender": {"nickname": "t"},
            "message": [{"type": "text", "text": "嗨"}],
            "raw_message": "嗨",
        },
        recent=[],
        hints=ChatHints(at_bot=True),
    )


@pytest.mark.asyncio
async def test_build_messages_injects_tts_when_ready(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.tts.paths._SERVER_ROOT", tmp_path)
    save_default_voice(b"x", filename="a.wav", prompt_text="hi")
    settings = Settings(
        chat_tts_base_url="http://tts/v1",
        chat_tts_api_key="k",
        chat_tts_model="m",
        chat_tts_voice="default",
        chat_memory_enabled=False,
        chat_game_kb_enabled=False,
        chat_web_search_enabled=False,
        chat_hero_look_enabled=False,
        tools_enabled=False,
    )
    mgr = MainlineManager(settings=settings)
    req = _req()
    ml = mgr.get(req.session.session_id, group_id=req.session.group_id)
    messages = await mgr._build_messages(req, ml, "嗨")
    sys = messages[0]["content"]
    assert "【语音工具" in sys
    assert '"type":"tts"' in sys


@pytest.mark.asyncio
async def test_build_messages_hides_tts_when_no_model(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.tts.paths._SERVER_ROOT", tmp_path)
    save_default_voice(b"x", filename="a.wav", prompt_text="hi")
    settings = Settings(
        chat_tts_base_url="http://tts/v1",
        chat_tts_api_key="k",
        chat_tts_model="",
        chat_memory_enabled=False,
        chat_game_kb_enabled=False,
        chat_web_search_enabled=False,
        chat_hero_look_enabled=False,
        tools_enabled=False,
    )
    mgr = MainlineManager(settings=settings)
    req = _req()
    ml = mgr.get(req.session.session_id, group_id=req.session.group_id)
    messages = await mgr._build_messages(req, ml, "嗨")
    assert "【语音工具" not in messages[0]["content"]
