from __future__ import annotations

from src.chat.tts.client import tts_provider
from src.core.settings import Settings


def tts_endpoint_configured(settings: Settings) -> bool:
    provider = tts_provider(settings)
    model = (settings.chat_tts_model or "").strip()
    key = (settings.chat_tts_api_key or "").strip()
    # 仅 OpenAI 兼容允许回退大模型 Key；豆包/千问必须用各自预设里的 Key
    if provider == "openai" and not key:
        key = (settings.llm_api_key or "").strip()
    if not (key and model):
        return False
    if provider in {"doubao-seed", "qwen"}:
        return True
    return bool((settings.chat_tts_base_url or "").strip())


def tts_voice_available(settings: Settings) -> bool:
    """音色由各预设 extra（如 speaker / voice）决定；无本地参考音上传。"""
    del settings
    return True


def tts_ready(settings: Settings, *, group_id: str = "") -> bool:
    """配了 TTS 端点即可用；跟聊天白名单走，无单独开关。"""
    del group_id
    return tts_endpoint_configured(settings)
