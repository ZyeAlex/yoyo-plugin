from pathlib import Path

import pytest

from src.chat.memory.affinity import (
    affinity_band,
    apply_affinity_delta,
    parse_affinity_delta,
)
from src.chat.memory.assembler import build_memory_context
from src.chat.memory.extract import extract_turn
from src.chat.memory.store import reset_memory_store_for_tests
from src.core.settings import Settings


def test_delta_is_small_and_clamped():
    assert parse_affinity_delta(8) == 3
    assert parse_affinity_delta(-9) == -3
    assert parse_affinity_delta("nope") == 0
    assert apply_affinity_delta(50, 2) == 52
    assert apply_affinity_delta(1, -3) == 0
    assert apply_affinity_delta(99, 3) == 100
    assert affinity_band(15) == "冷淡"
    assert affinity_band(52) == "普通"
    assert affinity_band(90) == "亲近"


def test_store_keeps_score_per_group_user(tmp_path: Path):
    store = reset_memory_store_for_tests(tmp_path)
    assert "affinity" not in store.load_user("g", "u1")
    store.update_user("g", "u1", {"affinity_delta": 40, "impression": "话少，但会接梗"})
    u = store.load_user("g", "u1")
    assert u["affinity"] == 53
    assert u["impression"] == "话少，但会接梗"
    store.update_user("g", "u1", {"affinity_delta": -1})
    assert store.load_user("g", "u1")["affinity"] == 52
    assert "affinity" not in store.load_user("other", "u1")


@pytest.mark.asyncio
async def test_assembler_shows_affinity_only_after_it_moves(tmp_path: Path):
    store = reset_memory_store_for_tests(tmp_path)
    settings = Settings(
        chat_memory_enabled=True,
        chat_memory_max_inject_chars=800,
        chat_embedding_enabled=False,
        chat_slang_enabled=False,
    )
    store.update_user("g", "u1", {"preferences": ["喜欢猫"]})
    plain = await build_memory_context(
        settings=settings, group_id="g", user_id="u1", message_text="嗨", store=store
    )
    assert "好感" not in plain.system_extra
    store.update_user("g", "u1", {"affinity_delta": 2, "impression": "话少，但会接梗"})
    shown = await build_memory_context(
        settings=settings, group_id="g", user_id="u1", message_text="嗨", store=store
    )
    assert "好感:52（普通" in shown.system_extra
    assert "看法:话少，但会接梗" in shown.system_extra
    assert "不是事实" in shown.system_extra


@pytest.mark.asyncio
async def test_extract_applies_delta_not_absolute_score(tmp_path: Path, monkeypatch):
    store = reset_memory_store_for_tests(tmp_path)

    async def fake_complete(messages, settings, *, abort_event=None):
        return """{
          "group_facts": [],
          "user_updates": {
            "preferences": [],
            "affinity": 100,
            "affinity_delta": 2,
            "impression": "嘴硬，其实会帮忙"
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
        group_id="g",
        user_id="u1",
        user_text="帮我看一眼",
        bot_replies=["行"],
        store=store,
    )
    u = store.load_user("g", "u1")
    assert u["affinity"] == 52
    assert "帮忙" in u["impression"]
