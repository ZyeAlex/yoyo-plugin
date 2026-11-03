import base64
from pathlib import Path

import pytest
from src.core.settings import Settings


@pytest.mark.asyncio
async def test_label_sticker_sends_data_url_and_vlm_model(tmp_path, monkeypatch):
    from src.chat.media import sticker_vlm as vlm_mod

    png = tmp_path / "face.png"
    raw = b"\x89PNG\r\n\x1a\n" + b"0" * 16
    png.write_bytes(raw)
    captured = {}

    async def fake_complete(messages, settings, **kwargs):
        captured["messages"] = messages
        captured["model"] = settings.llm_model
        captured["base"] = settings.llm_base_url
        captured["key"] = settings.llm_api_key
        return (
            '{"emotion":["无奈"],"scene":["回嘴"],"ocr_text":"摆","aliases":["摆烂"],'
            '"usable_for":["斗图"]}'
        )

    monkeypatch.setattr(vlm_mod, "complete", fake_complete)
    settings = Settings(
        llm_api_key="k",
        llm_base_url="https://llm.example/v1",
        llm_model="main-model",
    )
    tags = await vlm_mod.label_sticker(settings, png)
    assert tags["emotion"] == ["无奈"]
    assert tags["aliases"] == ["摆烂"]
    assert captured["model"] == "main-model"
    assert captured["base"] == "https://llm.example/v1"
    assert captured["key"] == "k"
    user = captured["messages"][1]["content"]
    assert user[0] == {"type": "text", "text": "标注这张表情包"}
    url = user[1]["image_url"]["url"]
    assert url.startswith("data:image/png;base64,")
    assert url.split(",", 1)[1] == base64.b64encode(raw).decode("ascii")
    assert captured["messages"][0]["content"] == "只输出 JSON：emotion,scene,ocr_text,aliases,usable_for"


@pytest.mark.asyncio
async def test_label_sticker_falls_back_to_llm_model(tmp_path, monkeypatch):
    from src.chat.media import sticker_vlm as vlm_mod

    png = tmp_path / "x.png"
    png.write_bytes(b"\x89PNG\r\n\x1a\n00")
    captured = {}

    async def fake_complete(messages, settings, **kwargs):
        captured["model"] = settings.llm_model
        return '{"emotion":["笑"],"scene":[],"ocr_text":"","aliases":[],"usable_for":[]}'

    monkeypatch.setattr(vlm_mod, "complete", fake_complete)
    settings = Settings(llm_api_key="k", llm_model="main-model")
    tags = await vlm_mod.label_sticker(settings, png)
    assert tags["emotion"] == ["笑"]
    assert captured["model"] == "main-model"


@pytest.mark.asyncio
async def test_label_sticker_returns_none_without_network_when_unconfigured(tmp_path):
    from src.chat.media.sticker_vlm import label_sticker

    png = tmp_path / "x.png"
    png.write_bytes(b"\x89PNG\r\n\x1a\n00")
    assert await label_sticker(Settings(), png) is None


@pytest.mark.asyncio
async def test_ingest_labels_and_stores_when_cache_enabled(tmp_path, monkeypatch):
    from src.chat.media import ingest as ingest_mod
    from src.chat.media.ingest import ingest_message
    from src.chat.media.sticker_store import StickerStore

    media = tmp_path / "media"
    stickers = tmp_path / "stickers"
    store = StickerStore(tmp_path / "index.sqlite", cap=10)
    monkeypatch.setattr(ingest_mod, "media_dir", lambda: media)
    monkeypatch.setattr(ingest_mod, "sticker_files_dir", lambda: stickers)
    monkeypatch.setattr(ingest_mod, "default_store", lambda settings: store)

    label_calls = {"n": 0}

    async def fake_label(settings, image_path: Path):
        label_calls["n"] += 1
        return {"emotion": ["无奈"], "scene": ["回嘴"], "ocr_text": "摆", "aliases": ["摆烂"]}

    monkeypatch.setattr(ingest_mod, "label_sticker", fake_label)
    calls = {"n": 0}

    async def fake_fetch(url, *, max_bytes, dest_dir):
        dest_dir.mkdir(parents=True, exist_ok=True)
        path = dest_dir / "deadbeef.png"
        path.write_bytes(b"x")
        calls["n"] += 1
        return path, "deadbeef"

    monkeypatch.setattr(ingest_mod, "fetch_to_cache", fake_fetch)
    msg = {
        "message": [
            {"type": "image", "url": "https://example/s.png", "summary": "[动画表情]", "sub_type": 1},
        ]
    }
    settings = Settings(chat_sticker_cache_enabled=True)
    result = await ingest_message(group_id="g1", message=msg, settings=settings)
    assert result["ok"] is True
    assert result["saved"] == 1
    assert store.has_labeled("deadbeef")
    assert store.search("无奈")[0]["hash"] == "deadbeef"

    result2 = await ingest_message(group_id="g1", message=msg, settings=settings)
    assert result2["ok"] is True
    assert label_calls["n"] == 1
    assert store.get("deadbeef")["hits"] >= 2


@pytest.mark.asyncio
async def test_ingest_vlm_none_deletes_cache_and_retries_next_time(tmp_path, monkeypatch):
    from src.chat.media import ingest as ingest_mod
    from src.chat.media.ingest import ingest_message
    from src.chat.media.sticker_store import StickerStore

    stickers = tmp_path / "stickers"
    store = StickerStore(tmp_path / "index.sqlite", cap=10)
    monkeypatch.setattr(ingest_mod, "media_dir", lambda: tmp_path / "media")
    monkeypatch.setattr(ingest_mod, "sticker_files_dir", lambda: stickers)
    monkeypatch.setattr(ingest_mod, "default_store", lambda settings: store)

    label_calls = {"n": 0}

    async def fake_label(settings, image_path: Path):
        label_calls["n"] += 1
        return None

    monkeypatch.setattr(ingest_mod, "label_sticker", fake_label)

    async def fake_fetch(url, *, max_bytes, dest_dir):
        dest_dir.mkdir(parents=True, exist_ok=True)
        path = dest_dir / "deadbeef.png"
        path.write_bytes(b"x")
        return path, "deadbeef"

    monkeypatch.setattr(ingest_mod, "fetch_to_cache", fake_fetch)
    msg = {
        "message": [
            {"type": "image", "url": "https://example/s.png", "summary": "[动画表情]", "sub_type": 1},
        ]
    }
    settings = Settings(chat_sticker_cache_enabled=True)
    result = await ingest_message(group_id="g1", message=msg, settings=settings)
    assert result["stickers_pending"] == 1
    assert result["stickers_labeled"] == 0
    assert label_calls["n"] == 1
    assert store.get("deadbeef") is None
    assert not (stickers / "deadbeef.png").exists()
    assert store.search("无奈") == []

    # 失败不留索引，下次仍会再尝试打标
    result2 = await ingest_message(group_id="g1", message=msg, settings=settings)
    assert result2["ok"] is True
    assert label_calls["n"] == 2
    assert store.get("deadbeef") is None


@pytest.mark.asyncio
async def test_ingest_skips_vlm_when_cache_disabled(tmp_path, monkeypatch):
    from src.chat.media import ingest as ingest_mod
    from src.chat.media.ingest import ingest_message
    from src.chat.media.sticker_store import StickerStore

    store = StickerStore(tmp_path / "index.sqlite")
    monkeypatch.setattr(ingest_mod, "media_dir", lambda: tmp_path / "media")
    monkeypatch.setattr(ingest_mod, "sticker_files_dir", lambda: tmp_path / "stickers")
    monkeypatch.setattr(ingest_mod, "default_store", lambda settings: store)

    async def boom(*a, **k):
        raise AssertionError("VLM must not be called")

    monkeypatch.setattr(ingest_mod, "label_sticker", boom)

    async def fake_fetch(url, *, max_bytes, dest_dir):
        dest_dir.mkdir(parents=True, exist_ok=True)
        path = dest_dir / "h.png"
        path.write_bytes(b"x")
        return path, "abc"

    monkeypatch.setattr(ingest_mod, "fetch_to_cache", fake_fetch)
    msg = {"message": [{"type": "image", "url": "https://x/s.png", "summary": "[动画表情]", "sub_type": 1}]}
    result = await ingest_message(
        group_id="g1", message=msg, settings=Settings(chat_sticker_cache_enabled=False)
    )
    assert result["saved"] == 1
    assert result["stickers_pending"] == 1
    assert store.get("abc") is None


def test_stickers_search_api(monkeypatch):
    from fastapi.testclient import TestClient
    from src.chat.media.sticker_store import StickerStore
    from src.main import create_app
    import tempfile
    from pathlib import Path as P

    tmp = P(tempfile.mkdtemp())
    store = StickerStore(tmp / "index.sqlite")
    store.upsert(
        "h1",
        "/p.png",
        {"emotion": ["无奈"], "scene": [], "ocr_text": "", "aliases": ["摆烂"]},
    )
    monkeypatch.setattr("src.api.media.default_store", lambda settings=None: store)
    client = TestClient(create_app())
    res = client.get("/api/stickers/search", params={"q": "摆烂"})
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["items"][0]["hash"] == "h1"
