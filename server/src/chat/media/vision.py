from __future__ import annotations

from typing import Any

from src.chat.media.segments import parse_message_segments
from src.core.settings import Settings


def _photo_urls(message: dict[str, Any] | None) -> list[str]:
    urls: list[str] = []
    for ref in parse_message_segments(message):
        if ref.kind == "sticker":
            continue
        if ref.kind == "photo" and ref.url:
            urls.append(ref.url)
    return urls


def select_vision_urls(
    *,
    message: dict[str, Any] | None,
    recent: list[dict[str, Any]] | None,
    settings: Settings,
    referring: bool = False,
) -> list[str]:
    """有普通图就收集 URL；无图则空（主线据此决定是否走多模态）。

    - 本条 photo 优先
    - ``chat_vision_include_recent_on_refer`` 为真时再补近期 photo（不看文案关键词）
    - 表情包不进视觉
    ``referring`` 保留参数兼容旧调用，已忽略。
    """
    del referring
    if not getattr(settings, "chat_vision_enabled", False):
        return []
    max_n = int(getattr(settings, "chat_vision_max_images", 2) or 0)
    if max_n <= 0:
        return []

    urls: list[str] = []
    seen: set[str] = set()

    def _add(items: list[str]) -> None:
        for url in items:
            if not url or url in seen:
                continue
            seen.add(url)
            urls.append(url)

    _add(_photo_urls(message))
    if getattr(settings, "chat_vision_include_recent_on_refer", True):
        for item in reversed(recent or []):
            if len(urls) >= max_n:
                break
            if isinstance(item, dict):
                _add(_photo_urls(item))
    return urls[:max_n]


def build_user_content(text_payload: str, image_urls: list[str]) -> str | list[dict]:
    if not image_urls:
        return text_payload
    parts: list[dict] = [{"type": "text", "text": text_payload}]
    for url in image_urls:
        parts.append({"type": "image_url", "image_url": {"url": url}})
    return parts
