import json

from src.chat.tts.paths import default_voice_meta_path, default_voice_wav_path
from src.chat.tts.voice import clear_default_voice, load_default_voice, save_default_voice


def test_voice_paths_under_data_tts(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.tts.paths._SERVER_ROOT", tmp_path)
    assert default_voice_wav_path() == tmp_path / "data" / "tts" / "default.wav"
    assert default_voice_meta_path() == tmp_path / "data" / "tts" / "default.json"


def test_save_load_clear_default_voice(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.tts.paths._SERVER_ROOT", tmp_path)
    assert load_default_voice() is None

    info = save_default_voice(b"RIFF....wav", filename="me.wav", prompt_text="你好呀")
    assert info["exists"] is True
    assert info["prompt_text"] == "你好呀"
    assert default_voice_wav_path().is_file()
    meta = json.loads(default_voice_meta_path().read_text(encoding="utf-8"))
    assert meta["prompt_text"] == "你好呀"
    assert meta["filename"] == "me.wav"

    loaded = load_default_voice()
    assert loaded is not None
    assert loaded["exists"] is True
    assert Path_like(loaded["path"]).is_file()
    assert loaded["prompt_text"] == "你好呀"
    assert loaded["audio"] == b"RIFF....wav"

    clear_default_voice()
    assert load_default_voice() is None
    assert not default_voice_wav_path().exists()


def Path_like(p):
    from pathlib import Path

    return Path(p)
