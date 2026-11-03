import pytest

from src.chat.tts.client import build_speech_body, synthesize_speech
from src.chat.tts.scope import tts_ready
from src.core.settings import Settings


def test_tts_ready_without_voice_field():
    s = Settings(
        chat_tts_provider="openai",
        chat_tts_base_url="http://tts/v1",
        chat_tts_api_key="k",
        chat_tts_model="m",
    )
    assert tts_ready(s, group_id="any") is True


def test_build_speech_body_merges_extra_under_core():
    settings = Settings(
        chat_tts_provider="openai",
        chat_tts_model="tts-1",
        chat_tts_extra={
            "voice": "alloy",
            "emotion": "happy",
            "speech_rate": 20,
            "input": "hijack",
            "additions": {"silence_duration": 200},
        },
    )
    body = build_speech_body(text="你好", settings=settings)
    assert body["input"] == "你好"
    assert body["voice"] == "alloy"
    assert body["model"] == "tts-1"
    assert body["emotion"] == "happy"
    assert body["speech_rate"] == 20
    assert body["additions"] == {"silence_duration": 200}


@pytest.mark.asyncio
async def test_synthesize_includes_extra(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.tts.paths._SERVER_ROOT", tmp_path)
    seen = {}

    class FakeResp:
        status_code = 200
        text = ""
        content = b"OK"

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

    import src.chat.tts.client as tts_client

    monkeypatch.setattr(tts_client.httpx, "AsyncClient", FakeClient)
    settings = Settings(
        chat_tts_provider="openai",
        chat_tts_base_url="http://tts.local/v1",
        chat_tts_api_key="k",
        chat_tts_model="m",
        chat_tts_extra={"voice": "v1", "emotion": "angry", "loudness_rate": 10},
    )
    await synthesize_speech(text="嗨", settings=settings)
    assert seen["body"]["emotion"] == "angry"
    assert seen["body"]["loudness_rate"] == 10
    assert seen["body"]["input"] == "嗨"
    assert seen["body"]["voice"] == "v1"
