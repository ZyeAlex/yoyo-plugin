import pytest

from src.chat.mainline import MainlineManager
from src.chat.memory.assembler import MemoryInject
from src.chat.persona import (
    clear_persona_cache_for_tests,
    heat_mode_label,
    load_heat_prompt,
    load_persona,
    resolve_heat_mode,
)
from src.chat.schema import ChatHints, ChatRequest, SessionInfo
from src.chat.temperature import HeatState
from src.core.settings import Settings


def test_persona_base_has_no_heat_mode_sections():
    clear_persona_cache_for_tests()
    text = load_persona()
    assert "冷闲模式" not in text
    assert "温观模式" not in text
    assert "热聊模式" not in text
    assert "旁听优先" in text
    assert "软萌" in text or "嘴硬心软" in text
    assert "雌小鬼" not in text


def test_resolve_heat_mode_mapping():
    assert resolve_heat_mode(None) == "cold"
    assert resolve_heat_mode(HeatState(session="away", mode="idle")) == "cold"
    assert resolve_heat_mode(HeatState(session="away", mode="observe")) == "warm"
    assert resolve_heat_mode(HeatState(session="dwelling", mode="idle")) == "hot"
    assert resolve_heat_mode(HeatState(session="dwelling", mode="observe")) == "hot"


def test_load_heat_prompt_is_mode_exclusive():
    clear_persona_cache_for_tests()
    cold = load_heat_prompt("cold")
    warm = load_heat_prompt("warm")
    hot = load_heat_prompt("hot")
    assert "开口判定" in cold and "热聊" not in cold and "温观" not in cold
    assert "开口判定" in warm and "冷闲" not in warm
    assert "看群状态" in hot and "看了一眼群" in hot
    assert "冷闲" not in hot and "温观" not in hot and "快判" not in hot
    assert "顺着" in hot and "主动插" in hot and "没有接" in hot
    assert "拿不准" in hot
    assert heat_mode_label("hot") == "热聊"


@pytest.mark.asyncio
async def test_heat_inject_comes_before_memory(monkeypatch):
    """开口判定必须在 system 最前（比人设、记忆都醒目）。"""
    clear_persona_cache_for_tests()
    settings = Settings(
        chat_heat_enabled=True,
        chat_memory_enabled=True,
        chat_game_kb_enabled=False,
        chat_web_search_enabled=False,
        chat_hero_look_enabled=False,
        tools_enabled=False,
        chat_tts_model="",
    )
    mgr = MainlineManager(settings=settings)
    req = ChatRequest(
        request_id="t-heat-order",
        session=SessionInfo(
            session_id="group:g-heat:bot:2",
            group_id="g-heat",
            bot_id="2",
            group_name="随便聊聊",
        ),
        message={
            "user_id": "1",
            "sender": {"nickname": "t"},
            "message": [{"type": "text", "text": "这个。。。。。"}],
            "raw_message": "这个。。。。。",
        },
        recent=[],
        hints=ChatHints(at_bot=False),
    )
    ml = mgr.get(req.session.session_id, group_id=req.session.group_id)
    ml.heat = HeatState(session="dwelling", mode="idle")

    async def _fake_mem(**_kwargs):
        return MemoryInject("【相关记忆】假记忆块用来测顺序", 1)

    monkeypatch.setattr("src.chat.mainline.build_memory_context", _fake_mem)
    messages = await mgr._build_messages(req, ml, "这个。。。。。")
    sys = messages[0]["content"]
    user = messages[1]["content"]
    if isinstance(user, list):
        user = " ".join(
            str(p.get("text") or "") for p in user if isinstance(p, dict)
        )
    heat_i = sys.find("【看群状态")
    persona_i = sys.find("你是「悠悠」")
    mem_i = sys.find("【记忆与日誌｜仅背景")
    assert heat_i == 0, sys[:120]
    assert persona_i > heat_i
    assert mem_i > persona_i
    assert "看了一眼群" in sys and "快判" not in sys
    assert "顺着" in sys and "主动插" in sys
    assert "本轮指向" in str(user)
    assert "看了一眼群" in str(user)
    assert "已经插过" in str(user)
    assert "replies\":[]" in str(user) or "replies" in str(user)
