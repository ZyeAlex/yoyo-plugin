import pytest
from fastapi.testclient import TestClient

from src.main import create_app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.tts.paths._SERVER_ROOT", tmp_path)
    return TestClient(create_app())


def test_preview_uses_synthesize(client, monkeypatch):
    async def fake_synth(*, text, settings, speed=None, style=None):
        assert "悠悠" in text or text
        return b"PREVIEW"

    monkeypatch.setattr("src.api.tts.synthesize_speech", fake_synth)
    r = client.post("/api/tts/preview", json={"text": "你好，我是悠悠。"})
    assert r.status_code == 200
    assert r.content == b"PREVIEW"
    assert "audio/" in r.headers.get("content-type", "")


def test_voice_routes_removed(client):
    assert client.get("/api/tts/voice").status_code == 404
    assert client.delete("/api/tts/voice").status_code == 404
