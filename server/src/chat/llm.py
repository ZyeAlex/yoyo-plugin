from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from src.core.settings import Settings

_logger = logging.getLogger("yoyo.chat.llm")


class LLMError(RuntimeError):
    pass


async def complete(
    messages: list[dict[str, Any]],
    settings: Settings,
    *,
    abort_event=None,
) -> str:
    if not settings.llm_configured:
        raise LLMError("LLM 未配置：请在 config/config.yaml 填写 chatLlmApiKey")

    if abort_event is not None and abort_event.is_set():
        raise LLMError("aborted")

    url = settings.llm_base_url.rstrip("/") + "/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": settings.llm_model,
        "messages": messages,
        "temperature": 0.7,
        "response_format": {"type": "json_object"},
    }

    timeout = httpx.Timeout(60.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        if abort_event is not None and abort_event.is_set():
            raise LLMError("aborted")
        try:
            res = await client.post(url, headers=headers, json=body)
        except httpx.HTTPError as err:
            raise LLMError(str(err)) from err

    if abort_event is not None and abort_event.is_set():
        raise LLMError("aborted")

    if res.status_code >= 400:
        raise LLMError(f"LLM HTTP {res.status_code}: {res.text[:300]}")

    data = res.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as err:
        raise LLMError(f"bad LLM payload: {json.dumps(data)[:300]}") from err
    return content or ""


def parse_replies_json(raw: str, *, max_replies: int = 3) -> list[dict[str, Any]]:
    text = (raw or "").strip()
    if not text:
        return []
    # strip markdown fence if any
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:].strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return [{"type": "text", "text": text[:120]}]

    items = data.get("replies") if isinstance(data, dict) else None
    if not isinstance(items, list):
        # single object with text
        if isinstance(data, dict) and data.get("text"):
            return [{"type": "text", "text": str(data["text"])[:200]}]
        return [{"type": "text", "text": text[:120]}]

    out: list[dict[str, Any]] = []
    for item in items[:max_replies]:
        if not isinstance(item, dict):
            continue
        typ = item.get("type") or "text"
        if typ == "image":
            path = item.get("path") or item.get("url")
            if path:
                out.append({"type": "image", "path": str(path), "mention": item.get("mention")})
            continue
        t = str(item.get("text") or "").strip()
        if t:
            out.append({"type": "text", "text": t[:200], "mention": item.get("mention")})
    return out
