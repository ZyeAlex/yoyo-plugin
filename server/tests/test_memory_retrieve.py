from pathlib import Path

import pytest

from src.chat.memory.retrieve import hybrid_retrieve, keyword_retrieve
from src.chat.memory.store import reset_memory_store_for_tests
from src.chat.memory.vector_store import VectorStore
from src.core.settings import Settings


def test_keyword_retrieve(tmp_path: Path):
    store = reset_memory_store_for_tests(tmp_path)
    gid = "g2"
    store.append_group_facts(gid, ["小明喜欢奶茶"])
    store.append_daily_note(gid, "今天讨论了奶茶店")
    store.upsert_slang(gid, "YYDS", "永远的神")
    hits = keyword_retrieve(store, gid, "奶茶怎么样", top_k=4)
    assert hits
    assert any("奶茶" in h["text"] for h in hits)


@pytest.mark.asyncio
async def test_vector_hybrid_with_mock(tmp_path: Path, monkeypatch):
    store = reset_memory_store_for_tests(tmp_path)
    gid = "g3"
    store.append_group_facts(gid, ["周末聚餐定在火锅"])
    vec = VectorStore(tmp_path / "t.vec.db")
    # unit vector for "火锅"
    emb = [1.0, 0.0, 0.0]
    vec.upsert(gid, "group", "1", "周末聚餐定在火锅", emb)

    async def fake_embed(settings, texts):
        return [[1.0, 0.0, 0.0] for _ in texts]

    monkeypatch.setattr("src.chat.memory.retrieve.embed_texts", fake_embed)
    settings = Settings(chat_embedding_enabled=True, chat_retrieve_top_k=3)
    hits = await hybrid_retrieve(
        store, settings, gid, "火锅", top_k=3, vector=vec
    )
    assert hits
    assert any("火锅" in h["text"] for h in hits)
