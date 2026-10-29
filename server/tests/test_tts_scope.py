from src.chat.tts.scope import tts_ready
from src.core.settings import Settings


def test_tts_ready_when_endpoint_and_voice():
    s = Settings(
        chat_tts_base_url="http://tts.local/v1",
        chat_tts_api_key="k",
        chat_tts_model="m",
        chat_tts_voice="default",
    )
    assert tts_ready(s, group_id="1") is True


def test_tts_ready_false_without_model():
    s = Settings(
        chat_tts_base_url="http://tts.local/v1",
        chat_tts_api_key="k",
        chat_tts_model="",
        chat_tts_voice="alloy",
    )
    assert tts_ready(s, group_id="1") is False


def test_tts_ready_false_without_voice_or_ref(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.tts.paths._SERVER_ROOT", tmp_path)
    s = Settings(
        chat_tts_base_url="http://tts.local/v1",
        chat_tts_api_key="k",
        chat_tts_model="m",
        chat_tts_voice="",
    )
    assert tts_ready(s, group_id="1") is False
