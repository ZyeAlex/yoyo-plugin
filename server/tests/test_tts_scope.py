from src.chat.tts.scope import tts_ready
from src.core.settings import Settings


def test_tts_ready_doubao_without_base_url():
    s = Settings(
        chat_tts_provider="doubao-seed",
        chat_tts_base_url="",
        chat_tts_api_key="k",
        chat_tts_model="seed-audio-1.0",
    )
    assert tts_ready(s, group_id="1") is True


def test_tts_ready_qwen_without_base_url():
    s = Settings(
        chat_tts_provider="qwen",
        chat_tts_api_key="k",
        chat_tts_model="qwen3-tts-flash",
    )
    assert tts_ready(s) is True


def test_tts_ready_openai_needs_base_url():
    s = Settings(
        chat_tts_provider="openai",
        chat_tts_base_url="",
        chat_tts_api_key="k",
        chat_tts_model="tts-1",
    )
    assert tts_ready(s) is False
    s2 = Settings(
        chat_tts_provider="openai",
        chat_tts_base_url="http://tts/v1",
        chat_tts_api_key="k",
        chat_tts_model="tts-1",
    )
    assert tts_ready(s2) is True


def test_tts_ready_false_without_model():
    s = Settings(
        chat_tts_provider="doubao-seed",
        chat_tts_api_key="k",
        chat_tts_model="",
    )
    assert tts_ready(s) is False
