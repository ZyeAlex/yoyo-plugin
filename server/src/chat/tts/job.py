from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any, Awaitable, Callable

from src.chat.tts.client import synthesize_speech, truncate_tts_text
from src.chat.tts.paths import voice_media_dir
from src.core.settings import Settings

_logger = logging.getLogger("yoyo.chat.tts")

OnDone = Callable[[str, dict[str, Any]], Awaitable[None]]


async def run_tts_job(
    *,
    job_id: str,
    text: str,
    settings: Settings,
    speed: float | None = None,
    style: str | None = None,
    on_done: OnDone | None = None,
) -> None:
    """Synthesize speech and write under data/media/voice/."""
    try:
        max_chars = int(getattr(settings, "chat_tts_max_chars", 80) or 80)
        spoken = truncate_tts_text(text, max_chars=max_chars)
        audio = await synthesize_speech(
            text=spoken,
            settings=settings,
            speed=speed,
            style=style,
        )
        # 以实际字节魔数定后缀（豆包常回 mp3，配置写 wav 会骗过 QQ）
        if audio[:3] == b"ID3" or audio[:2] == b"\xff\xfb" or audio[:2] == b"\xff\xf3":
            ext = ".mp3"
        elif audio[:4] == b"RIFF":
            ext = ".wav"
        elif audio[:4] == b"OggS":
            ext = ".ogg"
        else:
            fmt = (settings.chat_tts_format or "wav").strip().lower() or "wav"
            ext = ".mp3" if fmt == "mp3" else ".wav"
        path = voice_media_dir() / f"{job_id or uuid.uuid4().hex[:12]}{ext}"
        path.write_bytes(audio)
        result: dict[str, Any] = {
            "ok": True,
            "kind": "audio",
            "path": str(path.resolve()),
            "text": spoken,
        }
        if on_done:
            await on_done(job_id, result)
    except asyncio.CancelledError:
        _logger.info("tts job cancelled id=%s", job_id)
        raise
    except Exception as err:
        _logger.exception("tts job failed id=%s", job_id)
        if on_done:
            await on_done(
                job_id,
                {"ok": False, "kind": "audio", "error": str(err)[:300]},
            )
