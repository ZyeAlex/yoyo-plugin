import base64

import httpx
import pytest

from src.chat.tts import client as tts_client
from src.chat.tts.client import synthesize_speech
from src.chat.tts.voice import save_default_voice
from src.core.settings import Settings


@pytest.mark.asyncio
async def test_synthesize_posts_openai_speech(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.tts.paths._SERVER_ROOT", tmp_path)
    seen: dict = {}

    class FakeResp:
        status_code = 200
        text = ""
        content = b"FAKEWAV"

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, **k):
            seen["url"] = url
            seen["body"] = k.get("json") or {}
            seen["auth"] = (k.get("headers") or {}).get("Authorization")
            return FakeResp()

    monkeypatch.setattr(tts_client.httpx, "AsyncClient", FakeClient)

    settings = Settings(
        chat_tts_base_url="http://tts.local/v1",
        chat_tts_api_key="secret",
        chat_tts_model="tts-1",
        chat_tts_voice="alloy",
        chat_tts_format="wav",
        chat_tts_speed=1.2,
    )
    audio = await synthesize_speech(text="你好", settings=settings)
    assert audio == b"FAKEWAV"
    assert seen["url"] == "http://tts.local/v1/audio/speech"
    assert seen["auth"] == "Bearer secret"
    assert seen["body"]["model"] == "tts-1"
    assert seen["body"]["input"] == "你好"
    assert seen["body"]["voice"] == "alloy"
    assert seen["body"]["speed"] == 1.2
    assert "ref_audio" not in seen["body"]


@pytest.mark.asyncio
async def test_synthesize_attaches_ref_audio_when_default_voice_exists(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.tts.paths._SERVER_ROOT", tmp_path)
    save_default_voice(b"REFBYTES", filename="a.wav", prompt_text="参考句")
    seen: dict = {}

    class FakeResp:
        status_code = 200
        text = ""
        content = b"OUT"

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, **k):
            seen["body"] = k.get("json") or {}
            return FakeResp()

    monkeypatch.setattr(tts_client.httpx, "AsyncClient", FakeClient)
    settings = Settings(
        chat_tts_base_url="http://tts.local/v1",
        chat_tts_api_key="k",
        chat_tts_model="clone",
        chat_tts_voice="default",
    )
    await synthesize_speech(text="念这句", settings=settings, style="开心")
    body = seen["body"]
    assert body["voice"] == "default"
    assert body["ref_text"] == "参考句"
    assert body["style"] == "开心"
    assert body["ref_audio"].startswith("data:audio/wav;base64,")
    raw = body["ref_audio"].split(",", 1)[1]
    assert base64.b64decode(raw) == b"REFBYTES"
