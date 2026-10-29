from __future__ import annotations

import json
import logging
import re
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


def _pass_through_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep content as-is: str or OpenAI multimodal list parts."""
    out: list[dict[str, Any]] = []
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        content = msg.get("content")
        if isinstance(content, list):
            out.append({**msg, "content": [part for part in content]})
        else:
            out.append(msg)
    return out


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
        "messages": _pass_through_messages(messages),
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


_STAGE_DIR_RE = re.compile(
    r"(用户说[「\"“]|可以回[:：]|用一句|可带表情|嫌弃着回|要不承认|短句[。．]?$|输出必须是 JSON)",
    re.I,
)


def _looks_like_stage_direction(text: str) -> bool:
    """导演口吻 / 提示词残片，不能当群聊正文发出去。"""
    t = (text or "").strip()
    if not t:
        return True
    if _STAGE_DIR_RE.search(t):
        return True
    # 多段说明腔：含「或者」+ 引号示例，且提到悠悠第三人称
    if "悠悠" in t and ("或者" in t or "可以回" in t) and ("\n" in t or len(t) > 40):
        return True
    return False


def _loads_persona_payload(text: str) -> Any | None:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # 模型有时先写一段说明再甩 JSON：只取第一段对象
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return None
    return None


def parse_persona_json(raw: str, *, max_replies: int = 1) -> tuple[list[dict[str, Any]], str]:
    """解析人设 JSON → (bubbles, engagement)。engagement 缺省为 hold。

    非 JSON / 导演说明腔：返回空气泡（主线会 skip），绝不把原文当群消息发出。
    """
    text = (raw or "").strip()
    if not text:
        return [], "hold"
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:].strip()
    engagement = "hold"
    data = _loads_persona_payload(text)
    if data is None:
        return [], engagement

    if isinstance(data, dict):
        eng_raw = data.get("engagement")
        if eng_raw is None and isinstance(data.get("heat"), dict):
            eng_raw = data["heat"].get("engagement") or data["heat"].get("delta")
        if eng_raw is not None:
            engagement = str(eng_raw).strip().lower() or "hold"
            if engagement not in {"up", "hold", "down", "leave"}:
                engagement = "hold"

    items = data.get("replies") if isinstance(data, dict) else None
    if not isinstance(items, list):
        if isinstance(data, dict) and data.get("text"):
            t = str(data["text"]).strip()
            if t and not _looks_like_stage_direction(t):
                return [{"type": "text", "text": t[:200]}], engagement
        return [], engagement

    out: list[dict[str, Any]] = []
    text_or_image = 0
    budget = max(1, int(max_replies or 1))
    for item in items:
        if not isinstance(item, dict):
            continue
        typ = item.get("type") or "text"
        if typ == "sticker":
            sid = str(item.get("id") or "").strip()
            out.append(
                {
                    "type": "sticker",
                    "id": sid,
                    "auto": bool(item.get("auto")),
                    "mention": item.get("mention"),
                }
            )
            continue
        if typ == "tts":
            spoken = str(item.get("text") or item.get("prompt") or "").strip()
            bubble_tts: dict[str, Any] = {"type": "tts", "text": spoken}
            if item.get("speed") is not None and str(item.get("speed")).strip() != "":
                try:
                    bubble_tts["speed"] = float(item.get("speed"))
                except (TypeError, ValueError):
                    pass
            style = str(item.get("style") or item.get("emotion") or "").strip()
            if style:
                bubble_tts["style"] = style
            out.append(bubble_tts)
            continue
        if typ == "draw":
            prompt = str(item.get("prompt") or item.get("text") or "").strip()
            bubble: dict[str, Any] = {
                "type": "draw",
                "prompt": prompt,
                "mention": item.get("mention"),
            }
            size = item.get("size")
            if size is not None and str(size).strip():
                bubble["size"] = str(size).strip()
            if item.get("width") is not None:
                bubble["width"] = item.get("width")
            if item.get("height") is not None:
                bubble["height"] = item.get("height")
            if item.get("use_ref") is True or str(item.get("use_ref") or "").strip().lower() in {
                "1",
                "true",
                "yes",
            }:
                bubble["use_ref"] = True
            out.append(bubble)
            continue
        if typ == "look":
            out.append(
                {
                    "type": "look",
                    "q": str(item.get("q") or item.get("query") or item.get("text") or "").strip(),
                }
            )
            continue
        if typ == "lookup":
            out.append(
                {
                    "type": "lookup",
                    "kind": str(item.get("kind") or "").strip(),
                    "q": str(item.get("q") or item.get("query") or item.get("text") or "").strip(),
                }
            )
            continue
        if typ == "expand":
            edges = item.get("edges") or []
            if not isinstance(edges, list):
                edges = []
            out.append(
                {
                    "type": "expand",
                    "from_kind": str(item.get("from_kind") or item.get("kind") or "").strip(),
                    "id": str(item.get("id") or "").strip(),
                    "edges": [str(x).strip() for x in edges if str(x).strip()][:8],
                }
            )
            continue
        if typ == "web_search":
            bubble = {
                "type": "web_search",
                "q": str(item.get("q") or item.get("query") or item.get("text") or "").strip(),
            }
            intent = str(item.get("intent") or "").strip()
            if intent:
                bubble["intent"] = intent
            if item.get("max_results") is not None:
                bubble["max_results"] = item.get("max_results")
            out.append(bubble)
            continue
        if typ == "web_fetch":
            out.append(
                {
                    "type": "web_fetch",
                    "url": str(item.get("url") or "").strip(),
                }
            )
            continue
        if text_or_image >= budget:
            continue
        if typ == "image":
            path = item.get("path") or item.get("url")
            if path:
                out.append({"type": "image", "path": str(path), "mention": item.get("mention")})
                text_or_image += 1
            continue
        t = str(item.get("text") or "").strip()
        if t and not _looks_like_stage_direction(t):
            out.append({"type": "text", "text": t[:200], "mention": item.get("mention")})
            text_or_image += 1
    return out, engagement


def parse_replies_json(raw: str, *, max_replies: int = 1) -> list[dict[str, Any]]:
    bubbles, _eng = parse_persona_json(raw, max_replies=max_replies)
    return bubbles
