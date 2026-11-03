from __future__ import annotations

import logging
from typing import Any

import httpx

from src.core.settings import Settings

_logger = logging.getLogger("yoyo.chat.memory.embedder")


async def embed_texts(settings: Settings, texts: list[str]) -> list[list[float]] | None:
    """OpenAI-compatible embeddings. Returns None on failure (caller falls back)."""
    if not settings.chat_embedding_enabled or not texts:
        return None
    key = (settings.chat_embedding_api_key or settings.llm_api_key or "").strip()
    base = (settings.chat_embedding_base_url or settings.llm_base_url or "").rstrip("/")
    model = (settings.chat_embedding_model or "").strip()
    if not key or not base or not model:
        return None
    url = f"{base}/embeddings"
    payload: dict[str, Any] = {"model": model, "input": texts}
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(url, json=payload, headers=headers)
            r.raise_for_status()
            data = r.json()
        items = data.get("data") or []
        # preserve order by index
        items = sorted(items, key=lambda x: int(x.get("index") or 0))
        out: list[list[float]] = []
        for it in items:
            emb = it.get("embedding")
            if not isinstance(emb, list):
                return None
            out.append([float(x) for x in emb])
        if len(out) != len(texts):
            return None
        return out
    except Exception as e:
        _logger.warning("embedding failed: %s", e)
        return None
