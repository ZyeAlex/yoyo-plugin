from __future__ import annotations

from pathlib import Path

_SERVER_ROOT = Path(__file__).resolve().parents[3]


def tts_data_dir() -> Path:
    d = _SERVER_ROOT / "data" / "tts"
    d.mkdir(parents=True, exist_ok=True)
    return d


def voice_media_dir() -> Path:
    d = _SERVER_ROOT / "data" / "media" / "voice"
    d.mkdir(parents=True, exist_ok=True)
    return d
