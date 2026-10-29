from __future__ import annotations

from src.chat.tts.voice import load_default_voice
from src.core.settings import Settings


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
    """配了 TTS 模型端点且有 voice/参考音色即可用；跟聊天白名单走，无单独开关。"""
    del group_id
    if not tts_endpoint_configured(settings):
        return False
    return tts_voice_available(settings)
