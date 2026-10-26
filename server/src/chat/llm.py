from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from src.core.settings import Settings

_logger = logging.getLogger("yoyo.chat.llm")


class LLMError(RuntimeError):
    pass


def _extract_message_text(message: dict[str, Any]) -> str:
    """兼容普通模型与带 reasoning 字段的思考模型。"""
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    if isinstance(content, str) and content.strip():
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                parts.append(str(part.get("text") or ""))
            elif isinstance(part, str):
                parts.append(part)
        joined = "".join(parts).strip()
        if joined:
            return joined
    # 兜底：少数网关把正文塞进 reasoning（关闭思考后一般不会）
    reasoning = message.get("reasoning") or message.get("reasoning_content")
    if isinstance(reasoning, str) and reasoning.strip():
        return reasoning.strip()
    return ""


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
    enable_thinking = bool(getattr(settings, "enable_thinking", False))
    stream = bool(getattr(settings, "stream", False))
    body = {
        "model": settings.llm_model,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": int(getattr(settings, "max_output_tokens", 512) or 512),
        "stream": stream,
        "chat_template_kwargs": {"enable_thinking": enable_thinking},
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
        message = data["choices"][0]["message"]
    except (KeyError, IndexError, TypeError) as err:
        raise LLMError(f"bad LLM payload: {json.dumps(data)[:300]}") from err

    content = _extract_message_text(message)
    if not content:
        raise LLMError(f"empty LLM content: {json.dumps(message)[:300]}")
    return content


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
