from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import logging
import socket
from pathlib import Path
from urllib.parse import urlparse

import httpx

_logger = logging.getLogger("yoyo.chat.media.download")

_PNG = b"\x89PNG\r\n\x1a\n"
_JPEG = b"\xff\xd8\xff"
_GIF87 = b"GIF87a"
_GIF89 = b"GIF89a"

# Names that must never be fetched even if DNS is poisoned or skipped.
_BLOCKED_HOSTS = frozenset(
    {
        "localhost",
        "localhost.localdomain",
        "metadata.google.internal",
    }
)


def guess_ext(data: bytes) -> str:
    if data.startswith(_PNG):
        return ".png"
    if data.startswith(_JPEG):
        return ".jpg"
    if data.startswith(_GIF87) or data.startswith(_GIF89):
        return ".gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return ".bin"


def _ip_is_public(raw: str) -> bool:
    """True only for globally routable addresses (not RFC1918, loopback, link-local, CGNAT)."""
    text = str(raw or "").split("%", 1)[0].strip()
    if text.startswith("[") and text.endswith("]"):
        text = text[1:-1]
    try:
        addr = ipaddress.ip_address(text)
    except ValueError:
        return False
    mapped = getattr(addr, "ipv4_mapped", None)
    if mapped is not None:
        addr = mapped
    return bool(addr.is_global)


def _literal_ip(host: str) -> str | None:
    text = (host or "").strip()
    if text.startswith("[") and text.endswith("]"):
        text = text[1:-1]
    try:
        ipaddress.ip_address(text)
    except ValueError:
        return None
    return text


async def _host_is_public(host: str) -> bool:
    name = (host or "").strip().lower().rstrip(".")
    if not name or name in _BLOCKED_HOSTS:
        return False
    literal = _literal_ip(name)
    if literal is not None:
        return _ip_is_public(literal)
    try:
        infos = await asyncio.to_thread(
            socket.getaddrinfo, name, None, socket.AF_UNSPEC, socket.SOCK_STREAM
        )
    except OSError:
        return False
    if not infos:
        return False
    for info in infos:
        sockaddr = info[4] if len(info) > 4 else ()
        ip = sockaddr[0] if sockaddr else ""
        if not _ip_is_public(str(ip)):
            return False
    return True


async def _url_is_public_http(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False
    if parsed.username or parsed.password:
        return False
    return await _host_is_public(parsed.hostname)


async def fetch_to_cache(url: str, *, max_bytes: int, dest_dir: Path) -> tuple[Path, str] | None:
    if not url or not str(url).strip().lower().startswith(("http://", "https://")):
        return None
    if not await _url_is_public_http(str(url).strip()):
        _logger.debug("fetch_to_cache rejected non-public url")
        return None
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    try:
        # Do not follow redirects: a 3xx Location can point at link-local or metadata.
        # trust_env=False ignores HTTP(S)_PROXY, which would bypass the DNS check.
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=False, trust_env=False) as client:
            async with client.stream("GET", url) as resp:
                if resp.status_code != 200:
                    return None
                cl = resp.headers.get("content-length")
                if cl is not None:
                    try:
                        if int(cl) > max_bytes:
                            return None
                    except (TypeError, ValueError):
                        pass
                data = bytearray()
                async for chunk in resp.aiter_bytes():
                    if not chunk:
                        continue
                    if len(data) + len(chunk) > max_bytes:
                        return None
                    data.extend(chunk)
    except Exception:
        _logger.debug("fetch_to_cache failed url=%s", url, exc_info=True)
        return None
    if not data:
        return None
    digest = hashlib.sha256(data).hexdigest()
    path = dest_dir / f"{digest}{guess_ext(data)}"
    if not path.exists():
        path.write_bytes(data)
    return path, digest
