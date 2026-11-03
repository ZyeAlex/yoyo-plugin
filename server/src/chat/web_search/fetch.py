"""打开搜索结果正文。只抓公开 http(s)，拒绝内网与本机地址。"""

from __future__ import annotations

import ipaddress
import socket
from typing import Callable
from urllib.parse import urljoin, urlsplit

import httpx
from bs4 import BeautifulSoup

from src.chat.web_search.search import ACCEPT_LANGUAGE, USER_AGENT

_HEADERS = {"User-Agent": USER_AGENT, "Accept-Language": ACCEPT_LANGUAGE}
_TIMEOUT = httpx.Timeout(18.0, connect=8.0)
_MAX_HTML = 800_000
_BLOCKED_HOSTS = {"localhost", "localhost.localdomain"}

HttpGet = Callable[[str], str]


def _ip_ok(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def is_public_http_url(url: str) -> bool:
    try:
        parts = urlsplit((url or "").strip())
    except Exception:
        return False
    if parts.scheme not in {"http", "https"} or parts.username or parts.password:
        return False
    host = (parts.hostname or "").strip().lower().rstrip(".")
    if not host or host in _BLOCKED_HOSTS or host.endswith(".local") or host.endswith(".internal"):
        return False
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    if literal is not None:
        return _ip_ok(literal)
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    if not infos:
        return False
    for info in infos:
        try:
            resolved = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False
        if not _ip_ok(resolved):
            return False
    return True


def _read_capped(resp: httpx.Response, limit: int = _MAX_HTML) -> str:
    buf = bytearray()
    for chunk in resp.iter_bytes():
        if not chunk:
            continue
        buf.extend(chunk)
        if len(buf) >= limit:
            del buf[limit:]
            break
    encoding = resp.encoding or "utf-8"
    return bytes(buf).decode(encoding, errors="replace")


def _http_get_public(url: str) -> tuple[str, str]:
    current = url
    with httpx.Client(follow_redirects=False, timeout=_TIMEOUT, headers=_HEADERS) as client:
        for _ in range(4):
            if not is_public_http_url(current):
                raise RuntimeError("重定向到了不可访问的地址")
            with client.stream("GET", current) as resp:
                if resp.status_code in {301, 302, 303, 307, 308}:
                    loc = resp.headers.get("location") or ""
                    if not loc:
                        raise RuntimeError(f"HTTP {resp.status_code} 缺少 Location")
                    current = urljoin(current, loc)
                    continue
                resp.raise_for_status()
                return _read_capped(resp), str(resp.url)
    raise RuntimeError("重定向过多")


def _page_text(html: str, max_chars: int) -> tuple[str, str]:
    soup = BeautifulSoup(html or "", "html.parser")
    for tag in soup.find_all(["script", "style", "noscript", "svg", "iframe"]):
        tag.decompose()
    title = ""
    if soup.title:
        title = " ".join(soup.title.get_text(" ", strip=True).split())
    node = soup.find("article") or soup.find("main") or soup.body or soup
    text = " ".join(node.get_text(" ", strip=True).split())
    if len(text) > max_chars:
        text = text[:max_chars]
    return title, text


def fetch_page(
    url: str,
    *,
    http_get: HttpGet | None = None,
    max_chars: int = 3500,
) -> dict:
    target = (url or "").strip()
    if not is_public_http_url(target):
        return {"ok": False, "url": target, "error": "地址不可访问"}
    try:
        if http_get is not None:
            html, final = http_get(target), target
        else:
            html, final = _http_get_public(target)
            if not is_public_http_url(final):
                return {"ok": False, "url": target, "error": "地址不可访问"}
    except Exception as exc:
        return {"ok": False, "url": target, "error": str(exc)[:200]}
    title, content = _page_text(html, max(200, int(max_chars or 3500)))
    if not content:
        return {"ok": False, "url": final, "title": title, "error": "页面没有可读正文"}
    return {"ok": True, "url": final, "title": title, "content": content}
