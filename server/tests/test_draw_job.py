from pathlib import Path

import httpx
import pytest

from src.chat.jobs import (
    DEFAULT_DRAW_STYLE,
    _pick_image_url,
    _read_image_wh,
    edit_image,
    ensure_default_draw_style,
    generate_image,
    parse_size_spec,
    resolve_draw_size,
    run_draw_job,
)
from src.core.settings import Settings


def test_ensure_default_draw_style():
    assert ensure_default_draw_style("") == DEFAULT_DRAW_STYLE
    assert ensure_default_draw_style("一只橘猫坐在窗台") == f"一只橘猫坐在窗台，{DEFAULT_DRAW_STYLE}"
    assert ensure_default_draw_style("赛博朋克街头") == "赛博朋克街头"
    assert ensure_default_draw_style("写实人像，雨夜") == "写实人像，雨夜"
    assert ensure_default_draw_style("日系二次元少女") == "日系二次元少女"


def test_pick_image_url_openai_and_siliconflow():
    assert _pick_image_url({"data": [{"url": "https://x/a.png"}]}) == "https://x/a.png"
    assert _pick_image_url({"images": [{"url": "https://y/b.jpg"}]}) == "https://y/b.jpg"
    assert _pick_image_url({"data": [{"b64_json": "AAAA"}]}) == "data:image/png;base64,AAAA"
    assert _pick_image_url({}) == ""


def test_parse_size_spec_variants():
    assert parse_size_spec("1080x1920") == "1080x1920"
    assert parse_size_spec("1920×1080") == "1920x1080"
    assert parse_size_spec(None, width=800, height=1200) == "800x1200"
    assert parse_size_spec("2K") == "2K"
    assert parse_size_spec("nope") is None


def test_resolve_draw_size_edit_uses_source(tmp_path):
    import struct
    import zlib

    def _png(w: int, h: int) -> bytes:
        ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
        ihdr_chunk = struct.pack(">I", 13) + b"IHDR" + ihdr + struct.pack(">I", zlib.crc32(b"IHDR" + ihdr) & 0xFFFFFFFF)
        raw = b"".join(b"\x00" + b"\x00\x00\x00" * w for _ in range(h))
        comp = zlib.compress(raw, 9)
        idat = struct.pack(">I", len(comp)) + b"IDAT" + comp + struct.pack(">I", zlib.crc32(b"IDAT" + comp) & 0xFFFFFFFF)
        iend = struct.pack(">I", 0) + b"IEND" + struct.pack(">I", zlib.crc32(b"IEND") & 0xFFFFFFFF)
        return b"\x89PNG\r\n\x1a\n" + ihdr_chunk + idat + iend

    src = tmp_path / "s.png"
    src.write_bytes(_png(640, 960))
    assert _read_image_wh(src) == (640, 960)
    s = Settings(chat_draw_size="1080x1920")
    assert resolve_draw_size(s, source_path=src, for_edit=True) == "640x960"
    assert resolve_draw_size(s, size_override="1920x1080", source_path=src, for_edit=True) == "1920x1080"
    assert resolve_draw_size(s, for_edit=False) == "1080x1920"


@pytest.mark.asyncio
async def test_generate_image_requires_model(tmp_path, monkeypatch):
    settings = Settings(llm_api_key="k", chat_draw_model="")
    out = await generate_image(settings, "一只猫")
    assert out["ok"] is False


@pytest.mark.asyncio
async def test_generate_image_downloads(tmp_path, monkeypatch):
    draw_dir = tmp_path / "draws"
    monkeypatch.setattr("src.chat.jobs._DRAW_DIR", draw_dir)
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 32

    class FakeResp:
        status_code = 200
        text = ""

        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"url": "https://cdn.example/out.png"}]}

        @property
        def content(self):
            return png

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, **k):
            assert url.endswith("/images/generations")
            return FakeResp()

        async def get(self, *a, **k):
            return FakeResp()

    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)
    settings = Settings(
        llm_api_key="k",
        llm_base_url="https://api.example/v1",
        chat_draw_model="gpt-image-2",
        chat_draw_api_key="k",
        chat_draw_base_url="https://api.example/v1",
    )
    out = await generate_image(settings, "一只猫")
    assert out["ok"] is True
    assert out["mode"] == "generate"
    assert out["path"]
    assert Path(out["path"]).is_file()


@pytest.mark.asyncio
async def test_edit_image_multipart(tmp_path, monkeypatch):
    draw_dir = tmp_path / "draws"
    monkeypatch.setattr("src.chat.jobs._DRAW_DIR", draw_dir)
    src = tmp_path / "in.png"
    src.write_bytes(b"\x89PNG\r\n\x1a\n" + b"1" * 32)
    png = b"\x89PNG\r\n\x1a\n" + b"2" * 32
    seen = {}

    class FakeResp:
        status_code = 200
        text = ""

        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"b64_json": "AAAA"}]}

        @property
        def content(self):
            return png

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, **k):
            seen["url"] = url
            seen["has_files"] = "files" in k
            return FakeResp()

        async def get(self, *a, **k):
            return FakeResp()

    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)
    settings = Settings(
        llm_api_key="k",
        chat_draw_model="gpt-image-2",
        chat_draw_api_key="k",
        chat_draw_base_url="https://api.example/v1",
    )
    out = await edit_image(settings, "换成赛博朋克", source=str(src))
    assert out["ok"] is True
    assert out["mode"] == "edit"
    assert seen["url"].endswith("/images/edits")
    assert seen["has_files"] is True
    assert Path(out["path"]).is_file()


@pytest.mark.asyncio
async def test_run_draw_job_routes_edit_when_source(monkeypatch):
    done = {}

    async def on_done(jid, result):
        done["r"] = result

    async def fake_edit(settings, prompt, *, source, size=None):
        assert source == "https://x/a.png"
        return {"ok": True, "mode": "edit", "path": "/tmp/x.png", "caption": "e", "kind": "image"}

    import src.chat.jobs as jobs_mod

    monkeypatch.setattr(jobs_mod, "edit_image", fake_edit)
    await run_draw_job(
        job_id="j1",
        prompt="改成蓝色",
        settings=Settings(llm_api_key="x", chat_draw_model="gpt-image-2", chat_draw_api_key="x"),
        sources=["https://x/a.png"],
        on_done=on_done,
    )
    assert done["r"]["mode"] == "edit"


@pytest.mark.asyncio
async def test_run_draw_job_mock_when_no_model():
    done = {}

    async def on_done(jid, result):
        done["r"] = result

    await run_draw_job(
        job_id="j1",
        prompt="画猫",
        settings=Settings(llm_api_key="x", chat_draw_model="", draw_mock_delay_sec=0.5),
        delay_sec=0.5,
        on_done=on_done,
    )
    assert done["r"]["ok"] is True
    assert done["r"]["path"] is None
    assert "模拟" in done["r"]["caption"]
