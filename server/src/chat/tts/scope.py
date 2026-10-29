from __future__ import annotations

from src.chat.tts.voice import load_default_voice
from src.core.settings import Settings


def _norm_ids(raw: list[str] | tuple[str, ...] | None) -> list[str]:
    out: list[str] = []
    for x in raw or []:
        s = str(x or "").strip()
        if s:
            out.append(s)
    return out


def tts_group_allowed(
    group_id: str,
    *,
    include: list[str] | tuple[str, ...] | None = None,
    exclude: list[str] | tuple[str, ...] | None = None,
) -> bool:
    gid = str(group_id or "").strip()
    inc = _norm_ids(include)
    exc = _norm_ids(exclude)
    if gid and gid in exc:
        return False
    if inc:
        return bool(gid) and gid in inc
    return True


def tts_endpoint_configured(settings: Settings) -> bool:
    base = (settings.chat_tts_base_url or settings.llm_base_url or "").strip()
    key = (settings.chat_tts_api_key or settings.llm_api_key or "").strip()
    model = (settings.chat_tts_model or "").strip()
    return bool(base and key and model)


def tts_voice_available(settings: Settings) -> bool:
    if load_default_voice() is not None:
        return True
    return bool((settings.chat_tts_voice or "").strip())


def tts_ready(settings: Settings, *, group_id: str = "") -> bool:
    if not getattr(settings, "chat_tts_enabled", False):
        return False
    if not tts_group_allowed(
        group_id,
        include=list(getattr(settings, "chat_tts_include", None) or []),
        exclude=list(getattr(settings, "chat_tts_exclude", None) or []),
    ):
        return False
    if not tts_endpoint_configured(settings):
        return False
    return tts_voice_available(settings)
