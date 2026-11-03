import base64

import pytest

from src.chat.tts import client as tts_client
from src.chat.tts.client import (
    build_qwen_tts_body,
    build_seed_audio_body,
    resolve_openai_speech_url,
    resolve_seed_audio_url,
    synthesize_speech,
    tts_provider,
)
from src.core.settings import Settings


def test_resolve_urls():
    assert resolve_seed_audio_url() == "https://openspeech.bytedance.com/api/v3/tts/create"
    assert resolve_openai_speech_url("http://tts.local/v1") == "http://tts.local/v1/audio/speech"
    assert (
        resolve_openai_speech_url("http://tts.local/v1/audio/speech")
        == "http://tts.local/v1/audio/speech"
    )


def test_tts_provider_aliases():
    assert tts_provider(Settings(chat_tts_provider="doubao-seed")) == "doubao-seed"
    assert tts_provider(Settings(chat_tts_provider="qwen")) == "qwen"
    assert tts_provider(Settings(chat_tts_provider="openai")) == "openai"
    assert tts_provider(Settings(chat_tts_provider="", chat_tts_model="seed-audio-1.0")) == "doubao-seed"


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
        chat_tts_provider="openai",
        chat_tts_base_url="http://tts.local/v1",
        chat_tts_api_key="secret",
        chat_tts_model="tts-1",
        chat_tts_extra={"voice": "alloy", "speed": 1.2},
    )
    audio = await synthesize_speech(text="你好", settings=settings)
    assert audio == b"FAKEWAV"
    assert seen["url"] == "http://tts.local/v1/audio/speech"
    assert seen["auth"] == "Bearer secret"
    assert seen["body"]["model"] == "tts-1"
    assert seen["body"]["input"] == "你好"
    assert seen["body"]["voice"] == "alloy"
    assert seen["body"]["speed"] == 1.2


@pytest.mark.asyncio
async def test_synthesize_openai_passes_style(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.tts.paths._SERVER_ROOT", tmp_path)
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
        chat_tts_provider="openai",
        chat_tts_base_url="http://tts.local/v1",
        chat_tts_api_key="k",
        chat_tts_model="clone",
        chat_tts_extra={"voice": "alloy"},
    )
    await synthesize_speech(text="念这句", settings=settings, style="开心")
    body = seen["body"]
    assert body["voice"] == "alloy"
    assert body["style"] == "开心"
    assert "ref_audio" not in body
    assert "ref_text" not in body


@pytest.mark.asyncio
async def test_synthesize_seed_audio_builtin_url(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.tts.paths._SERVER_ROOT", tmp_path)
    seen: dict = {}

    class FakeResp:
        status_code = 200
        text = ""
        content = b""
        headers = {"content-type": "application/json"}

        def json(self):
            return {"code": 0, "audio": base64.b64encode(b"SEEDWAV").decode("ascii")}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, **k):
            seen["url"] = url
            seen["headers"] = k.get("headers") or {}
            seen["body"] = k.get("json") or {}
            return FakeResp()

    monkeypatch.setattr(tts_client.httpx, "AsyncClient", FakeClient)
    settings = Settings(
        chat_tts_provider="doubao-seed",
        chat_tts_base_url="",
        chat_tts_api_key="ark-key",
        chat_tts_model="seed-audio-1.0",
        chat_tts_extra={"speaker": "S_test"},
    )
    audio = await synthesize_speech(text="你好呀", settings=settings)
    assert audio == b"SEEDWAV"
    assert seen["url"] == "https://openspeech.bytedance.com/api/v3/tts/create"
    assert seen["headers"].get("X-Api-Key") == "ark-key"
    assert seen["body"]["references"] == [{"speaker": "S_test"}]
    assert seen["body"]["text_prompt"] == "你好呀"


@pytest.mark.asyncio
async def test_synthesize_qwen_downloads_audio_url(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.tts.paths._SERVER_ROOT", tmp_path)
    seen: dict = {}

    class FakeResp:
        def __init__(self, *, status=200, payload=None, content=b""):
            self.status_code = status
            self.text = ""
            self.content = content
            self._payload = payload
            self.headers = {"content-type": "application/json"}

        def json(self):
            return self._payload

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
            return FakeResp(
                payload={
                    "output": {"audio": {"data": "", "url": "https://cdn.example/a.wav"}},
                }
            )

        async def get(self, url, **k):
            seen["get"] = url
            return FakeResp(content=b"QWENWAV")

    monkeypatch.setattr(tts_client.httpx, "AsyncClient", FakeClient)
    settings = Settings(
        chat_tts_provider="qwen",
        chat_tts_api_key="sk-qwen",
        chat_tts_model="qwen3-tts-flash",
        chat_tts_extra={"voice": "Cherry"},
    )
    audio = await synthesize_speech(text="你好", settings=settings)
    assert audio == b"QWENWAV"
    assert "multimodal-generation/generation" in seen["url"]
    assert seen["body"]["input"]["voice"] == "Cherry"
    assert seen["get"] == "https://cdn.example/a.wav"


def test_build_seed_audio_body_speaker_from_extra(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.tts.paths._SERVER_ROOT", tmp_path)
    settings = Settings(
        chat_tts_provider="doubao-seed",
        chat_tts_model="seed-audio-1.0",
        chat_tts_extra={"voice": "zh_female_xxx", "speed": 1.5, "format": "mp3"},
    )
    body = build_seed_audio_body(text="嗨", settings=settings)
    assert body["references"] == [{"speaker": "zh_female_xxx"}]
    assert body["audio_config"]["format"] == "mp3"
    assert body["audio_config"]["speech_rate"] == 50


def test_build_qwen_body():
    settings = Settings(
        chat_tts_provider="qwen",
        chat_tts_model="qwen3-tts-flash",
        chat_tts_extra={"voice": "Serena", "language_type": "Chinese"},
    )
    body = build_qwen_tts_body(text="嗨", settings=settings)
    assert body["model"] == "qwen3-tts-flash"
    assert body["input"]["voice"] == "Serena"
    assert body["input"]["text"] == "嗨"
