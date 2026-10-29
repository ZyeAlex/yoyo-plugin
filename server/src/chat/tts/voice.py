from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from src.chat.tts.paths import default_voice_meta_path, default_voice_wav_path


def load_default_voice() -> dict[str, Any] | None:
    wav = default_voice_wav_path()
    if not wav.is_file():
        return None
    try:
        audio = wav.read_bytes()
    except OSError:
        return None
    if not audio:
        return None
    prompt_text = ""
    filename = wav.name
    meta_path = default_voice_meta_path()
    if meta_path.is_file():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            if isinstance(meta, dict):
                prompt_text = str(meta.get("prompt_text") or "")
                filename = str(meta.get("filename") or filename)
        except (OSError, json.JSONDecodeError, TypeError):
            pass
    return {
        "exists": True,
        "path": str(wav.resolve()),
        "prompt_text": prompt_text,
        "filename": filename,
        "audio": audio,
    }


def save_default_voice(
    audio: bytes,
    *,
    filename: str = "default.wav",
    prompt_text: str = "",
) -> dict[str, Any]:
    if not audio:
        raise ValueError("empty audio")
    wav = default_voice_wav_path()
    meta = default_voice_meta_path()
    wav.write_bytes(audio)
    payload = {
        "prompt_text": str(prompt_text or ""),
        "filename": str(filename or "default.wav"),
        "updated_at": time.time(),
    }
    meta.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "exists": True,
        "path": str(wav.resolve()),
        "prompt_text": payload["prompt_text"],
        "filename": payload["filename"],
    }


def clear_default_voice() -> None:
    for p in (default_voice_wav_path(), default_voice_meta_path()):
        try:
            p.unlink(missing_ok=True)
        except OSError:
            pass


def default_voice_status() -> dict[str, Any]:
    loaded = load_default_voice()
    if not loaded:
        return {"exists": False, "prompt_text": "", "filename": ""}
    return {
        "exists": True,
        "prompt_text": loaded.get("prompt_text") or "",
        "filename": loaded.get("filename") or "",
        "path": loaded.get("path") or "",
        "bytes": len(loaded.get("audio") or b""),
    }
