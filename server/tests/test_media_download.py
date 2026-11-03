import socket

import pytest
from pathlib import Path
from src.chat.media.download import fetch_to_cache

@pytest.mark.asyncio
async def test_fetch_to_cache(tmp_path, monkeypatch, httpx_mock=None):
    data = b"\x89PNG\r\n\x1a\n" + b"0" * 20
    seen = _patch_client(monkeypatch, data)
    out = await fetch_to_cache("https://example/a.png", max_bytes=1_000_000, dest_dir=tmp_path)
    assert out is not None
    path, digest = out
    assert path.is_file()
    assert len(digest) == 64
    assert seen["follow_redirects"] is False
    assert seen["trust_env"] is False


def _patch_client(monkeypatch, data: bytes, headers=None, *, status_code=200, resolved_ip="1.1.1.1"):
    hdrs = headers or {}
    seen: dict = {}
    code = status_code

    class FakeResp:
        status_code = code
        headers = hdrs

        def raise_for_status(self):
            pass

        async def aiter_bytes(self):
            yield data

    class FakeStream:
        async def __aenter__(self):
            return FakeResp()

        async def __aexit__(self, *a):
            pass

    class FakeClient:
        def __init__(self, **kwargs):
            seen.update(kwargs)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            pass

        def stream(self, method, url):
            seen["url"] = url
            return FakeStream()

    def fake_getaddrinfo(host, port, *args, **kwargs):
        family = socket.AF_INET6 if ":" in resolved_ip else socket.AF_INET
        return [(family, socket.SOCK_STREAM, 6, "", (resolved_ip, 0))]

    monkeypatch.setattr("src.chat.media.download.httpx.AsyncClient", lambda **k: FakeClient(**k))
    monkeypatch.setattr("src.chat.media.download.socket.getaddrinfo", fake_getaddrinfo)
    return seen


@pytest.mark.asyncio
async def test_fetch_to_cache_over_max_bytes(tmp_path, monkeypatch):
    data = b"\x89PNG\r\n\x1a\n" + b"0" * 50
    _patch_client(monkeypatch, data)
    out = await fetch_to_cache("https://example/a.png", max_bytes=10, dest_dir=tmp_path)
    assert out is None
    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
@pytest.mark.parametrize("ip", ["127.0.0.1", "10.1.2.3", "192.168.1.8", "172.16.0.4", "169.254.169.254", "::1"])
async def test_fetch_rejects_private_ip_after_dns(tmp_path, monkeypatch, ip):
    def boom(**kwargs):
        raise AssertionError("client must not be constructed for a non-public address")

    def fake_getaddrinfo(host, port, *args, **kwargs):
        family = socket.AF_INET6 if ":" in ip else socket.AF_INET
        return [(family, socket.SOCK_STREAM, 6, "", (ip, 0))]

    monkeypatch.setattr("src.chat.media.download.httpx.AsyncClient", boom)
    monkeypatch.setattr("src.chat.media.download.socket.getaddrinfo", fake_getaddrinfo)
    out = await fetch_to_cache("https://cdn.example/a.png", max_bytes=1_000_000, dest_dir=tmp_path)
    assert out is None
    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
async def test_fetch_rejects_metadata_and_loopback_literals(tmp_path, monkeypatch):
    def boom_dns(*args, **kwargs):
        raise AssertionError("literal IPs must not be resolved")

    def boom_client(**kwargs):
        raise AssertionError("client must not be constructed")

    monkeypatch.setattr("src.chat.media.download.socket.getaddrinfo", boom_dns)
    monkeypatch.setattr("src.chat.media.download.httpx.AsyncClient", boom_client)
    for url in (
        "http://169.254.169.254/latest/meta-data/",
        "http://127.0.0.1:8787/api/health",
        "http://10.0.0.5/secret",
        "http://[::1]/",
        "file:///etc/passwd",
    ):
        assert await fetch_to_cache(url, max_bytes=1_000_000, dest_dir=tmp_path) is None


@pytest.mark.asyncio
async def test_fetch_does_not_follow_redirect(tmp_path, monkeypatch):
    seen = _patch_client(
        monkeypatch,
        b"\x89PNG\r\n\x1a\nsecret",
        headers={"location": "http://127.0.0.1/secret"},
        status_code=302,
    )
    out = await fetch_to_cache("https://cdn.example/a.png", max_bytes=1_000_000, dest_dir=tmp_path)
    assert out is None
    assert seen["follow_redirects"] is False
    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
async def test_ingest_message_download_and_classify(tmp_path, monkeypatch):
    from src.chat.media import ingest as ingest_mod
    from src.chat.media.ingest import ingest_message
    from src.core.settings import Settings

    media = tmp_path / "media"
    stickers = tmp_path / "stickers"
    monkeypatch.setattr(ingest_mod, "media_dir", lambda: media)
    monkeypatch.setattr(ingest_mod, "sticker_files_dir", lambda: stickers)

    png = b"\x89PNG\r\n\x1a\n" + b"0" * 20
    _patch_client(monkeypatch, png)
    msg = {
        "message": [
            {"type": "image", "url": "https://example/p.png", "sub_type": 0},
            {"type": "image", "url": "https://example/s.png", "summary": "[动画表情]", "sub_type": 1},
            {"type": "face", "id": "14"},
        ]
    }
    result = await ingest_message(
        group_id="g1",
        message=msg,
        settings=Settings(chat_sticker_cache_enabled=False),
    )
    assert result["ok"] is True
    assert result["saved"] == 2
    assert result["stickers_pending"] == 1
    assert any(media.iterdir())
    assert any(stickers.iterdir())


def test_media_ingest_api(monkeypatch):
    from fastapi.testclient import TestClient
    from src.main import create_app

    async def fake_ingest(*, group_id, message, settings):
        return {"ok": True, "saved": 1, "stickers_pending": 0}

    monkeypatch.setattr("src.api.media.ingest_message", fake_ingest)
    client = TestClient(create_app())
    res = client.post(
        "/api/media/ingest",
        json={"group_id": "g1", "message": {"message": []}},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["saved"] == 1


@pytest.mark.asyncio
async def test_ingest_ignores_non_http_and_urls_outside_segments(tmp_path, monkeypatch):
    from src.chat.media import ingest as ingest_mod
    from src.chat.media.ingest import ingest_message
    from src.core.settings import Settings

    calls = {"n": 0}

    async def fake_fetch(url, *, max_bytes, dest_dir):
        calls["n"] += 1
        calls["url"] = url
        return None

    monkeypatch.setattr(ingest_mod, "fetch_to_cache", fake_fetch)
    msg = {
        "url": "http://169.254.169.254/latest/meta-data/",
        "file": "file:///etc/passwd",
        "message": [
            {"type": "image", "url": "file:///etc/passwd", "sub_type": 0},
            {"type": "text", "text": "看看"},
        ],
    }
    result = await ingest_message(group_id="g1", message=msg, settings=Settings(chat_sticker_cache_enabled=False))
    assert result["saved"] == 0
    assert calls["n"] == 0
