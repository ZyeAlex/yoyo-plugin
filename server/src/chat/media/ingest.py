from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from urllib.parse import urlparse

from src.chat.media.download import fetch_to_cache
from src.chat.media.segments import parse_message_segments
from src.chat.media.sticker_store import StickerStore, default_store
from src.chat.media.sticker_vlm import label_sticker
from src.core.settings import Settings

_logger = logging.getLogger("yoyo.chat.media.ingest")

_sticker_label_lock = asyncio.Lock()

_SERVER_ROOT = Path(__file__).resolve().parents[3]
MEDIA_DIR = _SERVER_ROOT / "data" / "media"
STICKER_FILES_DIR = _SERVER_ROOT / "data" / "stickers" / "files"


def media_dir() -> Path:
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    return MEDIA_DIR


def sticker_files_dir() -> Path:
    STICKER_FILES_DIR.mkdir(parents=True, exist_ok=True)
    return STICKER_FILES_DIR


def _is_http_url(url: str) -> bool:
    try:
        parsed = urlparse(str(url or "").strip())
    except ValueError:
        return False
    return parsed.scheme in {"http", "https"} and bool(parsed.hostname)


async def ingest_message(
    *,
    group_id: str,
    message: dict,
    settings: Settings,
    store: StickerStore | None = None,
) -> dict:
    """Download + classify; label stickers via VLM when cache is enabled."""
    # Only URLs that parse_message_segments already found on this message.
    # Callers cannot pass a side-channel URL; non-http(s) schemes are dropped.
    refs = parse_message_segments(message if isinstance(message, dict) else None)
    allowed_urls = {(ref.url or "").strip() for ref in refs if _is_http_url(ref.url or "")}
    max_bytes = int(getattr(settings, "chat_media_max_bytes", 8_388_608) or 8_388_608)
    library_cap = int(getattr(settings, "chat_sticker_library_cap", 120) or 120)
    cache_on = bool(getattr(settings, "chat_sticker_cache_enabled", True))
    sticker_store = store
    saved = 0
    stickers_pending = 0
    stickers_labeled = 0
    _download_kinds = frozenset({"photo", "sticker", "mface"})
    for ref in refs:
        if ref.kind == "link" or ref.kind not in _download_kinds:
            continue
        url = (ref.url or "").strip()
        if url not in allowed_urls or not _is_http_url(url):
            continue
        dest = sticker_files_dir() if ref.kind == "sticker" else media_dir()
        out = await fetch_to_cache(url, max_bytes=max_bytes, dest_dir=dest)
        if out is None:
            continue
        path, digest = out
        ref.path = str(path)
        saved += 1
        if ref.kind != "sticker":
            continue
        if not cache_on:
            stickers_pending += 1
            _logger.debug(
                "sticker cache off group=%s hash=%s path=%s",
                group_id,
                digest,
                path,
            )
            continue
        if sticker_store is None:
            sticker_store = default_store(settings)
        async with _sticker_label_lock:
            existing = sticker_store.get(digest)
            if existing is not None and sticker_store.has_labeled(digest):
                sticker_store.upsert(
                    digest, str(path), existing.get("tags") or {}, cap=library_cap
                )
                continue
            tags = await label_sticker(settings, path)
            if tags:
                sticker_store.upsert(digest, str(path), tags, cap=library_cap)
                stickers_labeled += 1
            else:
                # 打标失败：不留 stub，删掉落盘与索引
                sticker_store.delete(digest)
                try:
                    Path(path).unlink(missing_ok=True)
                except OSError:
                    _logger.debug("unlink failed sticker path=%s", path, exc_info=True)
                stickers_pending += 1
                _logger.warning(
                    "sticker label failed, cache removed group=%s hash=%s",
                    group_id,
                    digest,
                )
    return {
        "ok": True,
        "saved": saved,
        "stickers_pending": stickers_pending,
        "stickers_labeled": stickers_labeled,
    }
