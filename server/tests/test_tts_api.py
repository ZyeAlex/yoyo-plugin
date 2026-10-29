import base64

import pytest
from fastapi.testclient import TestClient

from src.main import create_app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.tts.paths._SERVER_ROOT", tmp_path)
    return TestClient(create_app())


def test_voice_upload_status_clear(client):
    raw = b"RIFF" + b"\x00" * 80
    r = client.post(
        "/api/tts/voice",
        json={
            "audio_base64": base64.b64encode(raw).decode("ascii"),
            "filename": "a.wav",
            "prompt_text": "你好",
        },
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    st = client.get("/api/tts/voice")
    assert st.json()["exists"] is True
    assert st.json()["prompt_text"] == "你好"
    d = client.delete("/api/tts/voice")
    assert d.json()["exists"] is False


def test_preview_uses_synthesize(client, monkeypatch):
    async def fake_synth(*, text, settings, speed=None, style=None):
        assert "悠悠" in text or text
        return b"PREVIEW"

    monkeypatch.setattr("src.api.tts.synthesize_speech", fake_synth)
    r = client.post("/api/tts/preview", json={"text": "你好，我是悠悠。"})
    assert r.status_code == 200
    assert r.content == b"PREVIEW"
    assert "audio/" in r.headers.get("content-type", "")
