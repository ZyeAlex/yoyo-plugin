from __future__ import annotations

import base64
import json
import logging
import re
from pathlib import Path
from typing import Any

from src.chat.llm import complete
from src.core.settings import Settings

_logger = logging.getLogger("yoyo.chat.media.sticker_vlm")

SYSTEM = "只输出 JSON：emotion,scene,ocr_text,aliases,usable_for"
_MIME = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


def _mime_for(path: Path) -> str:
    return _MIME.get(path.suffix.lower(), "image/png")


def _as_str_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        text = value.strip()
        return [text] if text else []
    if isinstance(value, list):
        out: list[str] = []
        for item in value:
            s = str(item).strip()
            if s:
                out.append(s)
        return out
    s = str(value).strip()
    return [s] if s else []


def _parse_tags(raw: str) -> dict[str, Any] | None:
    text = (raw or "").strip()
    if not text:
        return None
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, flags=re.S)
        if not m:
            return None
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            return None
    if not isinstance(data, dict):
        return None
    tags = {
        "emotion": _as_str_list(data.get("emotion")),
        "scene": _as_str_list(data.get("scene")),
        "ocr_text": str(data.get("ocr_text") or "").strip(),
        "aliases": _as_str_list(data.get("aliases")),
        "usable_for": _as_str_list(data.get("usable_for")),
    }
    if not any((tags["emotion"], tags["scene"], tags["ocr_text"], tags["aliases"], tags["usable_for"])):
        return None
    return tags


async def label_sticker(settings: Settings, image_path: Path) -> dict | None:
    path = Path(image_path)
    if not path.is_file():
        return None
    call_settings = settings
    if not call_settings.llm_configured:
        return None
    try:
        raw = path.read_bytes()
    except OSError:
        _logger.debug("read sticker failed path=%s", path, exc_info=True)
        return None
    if not raw:
        return None
    b64 = base64.b64encode(raw).decode("ascii")
    mime = _mime_for(path)
    messages = [
        {"role": "system", "content": SYSTEM},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "标注这张表情包"},
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
            ],
        },
    ]
    try:
        content = await complete(messages, call_settings)
    except Exception:
        _logger.warning("sticker vlm failed path=%s", path, exc_info=True)
        return None
    return _parse_tags(content)
