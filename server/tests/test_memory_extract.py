from pathlib import Path

import pytest

from src.chat.memory.extract import extract_turn
from src.chat.memory.store import reset_memory_store_for_tests
from src.core.settings import Settings


@pytest.mark.asyncio
async def test_extract_writes(tmp_path: Path, monkeypatch):
    store = reset_memory_store_for_tests(tmp_path)
    gid = "g4"

    async def fake_complete(messages, settings, *, abort_event=None):
        return """{
          "group_facts": ["群规：周五不加班"],
          "user_updates": {"preferences": ["喜欢猫"], "notes": []},
          "slang": [{"term": "摸鱼", "meaning": "上班划水", "examples": []}],
          "daily_note": "聊了摸鱼"
        }"""

    monkeypatch.setattr("src.chat.memory.extract.complete", fake_complete)

    async def no_index(*a, **k):
        return 0

    monkeypatch.setattr("src.chat.memory.extract.index_texts", no_index)

    settings = Settings(
        llm_api_key="x",
        chat_memory_enabled=True,
        chat_extract_enabled=True,
        chat_embedding_enabled=False,
    )
    result = await extract_turn(
        settings,
        group_id=gid,
        user_id="u1",
        user_text="我喜欢猫，摸鱼是什么意思",
        bot_replies=["摸鱼就是上班划水啦"],
        store=store,
    )
    assert result["ok"]
    assert "周五" in store.load_group_profile(gid)
    assert "喜欢猫" in store.load_user(gid, "u1")["preferences"]
    slang = store.load_slang(gid)
    assert any(s["term"] == "摸鱼" for s in slang)
    assert "摸鱼" in store.load_daily(gid)


@pytest.mark.asyncio
async def test_extract_drops_bot_nickname_and_bot_prefs(tmp_path: Path, monkeypatch):
    store = reset_memory_store_for_tests(tmp_path)
    gid = "g_bot_nick"

    async def fake_complete(messages, settings, *, abort_event=None):
        return """{
          "group_facts": ["群内用杂鱼互怼"],
          "user_updates": {
            "nickname": "悠悠",
            "preferences": ["不喜被拉着比较游戏"],
            "taboos": ["拿不同游戏互相比较"],
            "notes": ["喜欢喝茶"]
          },
          "slang": [],
          "daily_note": ""
        }"""

    monkeypatch.setattr("src.chat.memory.extract.complete", fake_complete)

    async def no_index(*a, **k):
        return 0

    monkeypatch.setattr("src.chat.memory.extract.index_texts", no_index)

    settings = Settings(
        llm_api_key="x",
        chat_memory_enabled=True,
        chat_extract_enabled=True,
        chat_embedding_enabled=False,
    )
    await extract_turn(
        settings,
        group_id=gid,
        user_id="395863659",
        user_text="比碧蓝航线强吗",
        bot_replies=["别拉我比来比去"],
        store=store,
    )
    u = store.load_user(gid, "395863659")
    assert u["nickname"] == ""
    assert "喜欢喝茶" in u["notes"]
    assert u["preferences"] == []
    assert u["taboos"] == []
