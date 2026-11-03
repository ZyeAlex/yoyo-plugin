"""公开网页搜索：仅 Bing HTML 抓取。无 API Key。"""

from __future__ import annotations

import base64
from typing import Callable
from urllib.parse import parse_qs, quote_plus, unquote, urlsplit

import httpx
from bs4 import BeautifulSoup

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
ACCEPT_LANGUAGE = "zh-CN,zh;q=0.9,en;q=0.8"
_HEADERS = {"User-Agent": USER_AGENT, "Accept-Language": ACCEPT_LANGUAGE}
_TIMEOUT = httpx.Timeout(12.0, connect=5.0)

HtmlFetcher = Callable[[str], str]


def engines_for(_intent: str | None = None) -> list[str]:
    """兼容旧调用；引擎固定为 Bing。"""
    return ["bing"]


def clamp_max_results(max_results: int | None) -> int:
    try:
        n = int(10 if max_results is None else max_results)
    except (TypeError, ValueError):
        n = 10
    if n < 1:
        return 1
    if n > 50:
        return 50
    return n


def _confidence(index: int) -> float:
    score = max(0.35, 1.0 - index * 0.05)
    return float(f"{score:.3f}")


def _b64_url(token: str) -> str:
    token = unquote(token or "").strip()
    if token.startswith("a1"):
        token = token[2:]
    if not token:
        return ""
    pad = "=" * ((4 - len(token) % 4) % 4)
    raw = token + pad
    for decoder in (base64.urlsafe_b64decode, base64.b64decode):
        try:
            text = decoder(raw).decode("utf-8")
        except Exception:
            continue
        text = text.strip()
        if text.startswith("http://") or text.startswith("https://"):
            return text
    return ""


def unwrap_bing_url(href: str) -> str:
    href = (href or "").strip()
    if href.startswith("//"):
        href = "https:" + href
    if "bing.com/ck/" in href:
        token = (parse_qs(urlsplit(href).query).get("u") or [""])[0]
        return _b64_url(token)
    if href.startswith("http://") or href.startswith("https://"):
        return href
    return ""


def _one_space(text: str) -> str:
    return " ".join((text or "").split())


def parse_bing(html: str) -> list[dict]:
    soup = BeautifulSoup(html or "", "html.parser")
    rows: list[dict] = []
    for block in soup.select("li.b_algo"):
        link = block.select_one("h2 a")
        if link is None:
            continue
        title = _one_space(link.get_text(" ", strip=True))
        url = unwrap_bing_url(str(link.get("href") or ""))
        snip = block.select_one("div.b_caption p") or block.select_one("p")
        snippet = _one_space(snip.get_text(" ", strip=True) if snip else "")
        if not title or not url:
            continue
        rows.append({"title": title, "url": url, "snippet": snippet, "source_engine": "bing"})
    return rows


def _empty(query: str, intent: str | None, errors: list[str]) -> dict:
    return {
        "aggregated_results": [],
        "query_analysis": {"query": query, "intent": intent, "engines": ["bing"]},
        "metadata": {"result_count": 0, "errors": errors},
    }


def bing_search_url(query: str) -> str:
    return f"https://www.bing.com/search?q={quote_plus(query)}&setlang=zh-hans"


class CompositeSearch:
    """Bing-only 搜索（保留类名以免调用方大改）。"""

    def __init__(self, fetcher: HtmlFetcher | None = None) -> None:
        self._fetcher = fetcher

    def search(self, query: str, intent: str | None = None, max_results: int = 10) -> dict:
        q = (query or "").strip()
        raw_intent = intent.strip() if isinstance(intent, str) and intent.strip() else None
        limit = clamp_max_results(max_results)
        if not q:
            return _empty("", raw_intent, ["empty query"])

        fetcher = self._fetcher or _http_get
        errors: list[str] = []
        try:
            html = fetcher(bing_search_url(q))
            rows = parse_bing(html)
        except Exception as exc:
            errors.append(f"bing: {exc}"[:240])
            rows = []

        merged: list[dict] = []
        seen: set[str] = set()
        for row in rows:
            url = row["url"]
            if url in seen:
                continue
            seen.add(url)
            merged.append(row)
            if len(merged) >= limit:
                break

        results = []
        for index, row in enumerate(merged[:limit]):
            results.append({**row, "confidence_score": _confidence(index)})
        return {
            "aggregated_results": results,
            "query_analysis": {"query": q, "intent": raw_intent, "engines": ["bing"]},
            "metadata": {"result_count": len(results), "errors": errors},
        }


def _http_get(url: str) -> str:
    with httpx.Client(follow_redirects=True, timeout=_TIMEOUT, headers=_HEADERS) as client:
        resp = client.get(url)
        resp.raise_for_status()
        return resp.text
