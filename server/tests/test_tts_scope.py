from src.chat.tts.scope import tts_group_allowed, tts_ready
from src.core.settings import Settings


def test_group_allowed_empty_include_means_all_except_exclude():
    assert tts_group_allowed("1", include=[], exclude=[]) is True
    assert tts_group_allowed("1", include=[], exclude=["1"]) is False
    assert tts_group_allowed("2", include=[], exclude=["1"]) is True


def test_group_allowed_nonempty_include():
    assert tts_group_allowed("1", include=["1", "2"], exclude=[]) is True
    assert tts_group_allowed("3", include=["1", "2"], exclude=[]) is False
    assert tts_group_allowed("1", include=["1"], exclude=["1"]) is False


def test_tts_ready_requires_enabled_endpoint_and_voice(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.tts.paths._SERVER_ROOT", tmp_path)
    s = Settings(
        chat_tts_enabled=False,
        chat_tts_base_url="http://tts.local/v1",
        chat_tts_api_key="k",
        chat_tts_model="m",
        chat_tts_voice="default",
    )
    assert tts_ready(s, group_id="1") is False

    s = s.model_copy(update={"chat_tts_enabled": True, "chat_tts_voice": ""})
    assert tts_ready(s, group_id="1") is False

    s = s.model_copy(update={"chat_tts_voice": "alloy"})
    assert tts_ready(s, group_id="1") is True

    s = s.model_copy(update={"chat_tts_exclude": ["1"], "chat_tts_voice": "alloy"})
    assert tts_ready(s, group_id="1") is False
