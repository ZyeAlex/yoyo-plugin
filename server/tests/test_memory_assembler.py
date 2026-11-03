from pathlib import Path

import pytest

from src.chat.memory.assembler import build_memory_context
from src.chat.memory.store import reset_memory_store_for_tests
from src.chat.speakers import CastMember
from src.core.settings import Settings


@pytest.mark.asyncio
async def test_assembler_budget_and_slang(tmp_path: Path):
    store = reset_memory_store_for_tests(tmp_path)
    gid = "g9"
    store.append_group_facts(gid, ["群规：周五晚自习"])
    store.update_user(gid, "u1", {"preferences": ["喜欢抹茶"], "alias": "小抹茶"})
    store.upsert_slang(gid, "躺平", "不想干活")

    settings = Settings(
        chat_memory_enabled=True,
        chat_memory_max_inject_chars=400,
        chat_embedding_enabled=False,
        chat_slang_enabled=True,
    )
    inj = await build_memory_context(
        settings=settings,
        group_id=gid,
        user_id="u1",
        message_text="今天又想躺平了",
        store=store,
    )
    assert "群约定" in inj.system_extra or "群规" in inj.system_extra
    assert "当前用户" in inj.system_extra or "抹茶" in inj.system_extra
    assert "黑话" in inj.system_extra
    assert "躺平" in inj.system_extra
    assert inj.used_chars <= 400


@pytest.mark.asyncio
async def test_assembler_cast_comes_first(tmp_path: Path):
    store = reset_memory_store_for_tests(tmp_path)
    gid = "g-cast"
    store.update_user(gid, "347", {"nickname": "小长门", "preferences": ["想摸头"]})
    store.append_group_facts(gid, ["群规：勿刷屏"])
    settings = Settings(
        chat_memory_enabled=True,
        chat_memory_max_inject_chars=800,
        chat_embedding_enabled=False,
        chat_slang_enabled=False,
    )
    cast = [
        CastMember(user_id="99", nickname="悠悠", role="member", is_self=True),
        CastMember(user_id="347", nickname="小长门", role="admin", is_self=False),
    ]
    inj = await build_memory_context(
        settings=settings,
        group_id=gid,
        user_id="347",
        message_text="嗨",
        store=store,
        cast=cast,
    )
    assert "【出场人物】" in inj.system_extra
    assert inj.system_extra.index("【出场人物】") < inj.system_extra.index("群约定")
    assert "自己 QQ:99" in inj.system_extra
    assert "小长门" in inj.system_extra
    assert "想摸头" in inj.system_extra


@pytest.mark.asyncio
async def test_assembler_disabled(tmp_path: Path):
    store = reset_memory_store_for_tests(tmp_path)
    settings = Settings(chat_memory_enabled=False)
    inj = await build_memory_context(
        settings=settings,
        group_id="g",
        user_id="u",
        message_text="hi",
        store=store,
    )
    assert inj.system_extra == ""
