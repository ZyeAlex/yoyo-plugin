from __future__ import annotations

import base64
import logging
from typing import Any

import httpx

from src.chat.tts.voice import load_default_voice
from src.core.settings import Settings

_logger = logging.getLogger("yoyo.chat.tts")


def _clamp_speed(raw: Any, default: float = 1.0) -> float:
    try:
        v = float(raw if raw is not None else default)
    except (TypeError, ValueError):
        v = default
    return max(0.5, min(2.0, v))


def truncate_tts_text(text: str, *, max_chars: int) -> str:
    t = (text or "").strip()
    n = max(1, int(max_chars or 80))
    return t[:n]


async def synthesize_speech(
    *,
    text: str,
    settings: Settings,
    speed: float | None = None,
    style: str | None = None,
) -> bytes:
    """POST OpenAI-compatible /v1/audio/speech → audio bytes."""
    max_chars = int(getattr(settings, "chat_tts_max_chars", 80) or 80)
    content = truncate_tts_text(text, max_chars=max_chars)
    if not content:
        raise ValueError("empty tts text")

    base = (settings.chat_tts_base_url or settings.llm_base_url or "").rstrip("/")
    key = (settings.chat_tts_api_key or settings.llm_api_key or "").strip()
    model = (settings.chat_tts_model or "").strip()
    if not base or not key or not model:
        raise ValueError("tts endpoint not configured")

    voice = (settings.chat_tts_voice or "default").strip() or "default"
    fmt = (settings.chat_tts_format or "wav").strip() or "wav"
    body: dict[str, Any] = {
        "model": model,
        "input": content,
        "voice": voice,
        "response_format": fmt,
        "speed": _clamp_speed(speed if speed is not None else settings.chat_tts_speed),
    }
    style_s = str(style or "").strip()
    if style_s:
        body["style"] = style_s

    ref = load_default_voice()
    if ref and ref.get("audio"):
        b64 = base64.b64encode(ref["audio"]).decode("ascii")
        body["ref_audio"] = f"data:audio/wav;base64,{b64}"
        prompt = str(ref.get("prompt_text") or "").strip()
        if prompt:
            body["ref_text"] = prompt

    url = f"{base}/audio/speech"
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(url, headers=headers, json=body)
        if resp.status_code >= 400:
            snippet = (resp.text or "")[:300]
            _logger.warning("tts speech failed status=%s body=%s", resp.status_code, snippet)
            raise RuntimeError(f"tts http {resp.status_code}: {snippet}")
        data = resp.content
        if not data:
            raise RuntimeError("tts empty audio")
        return data
