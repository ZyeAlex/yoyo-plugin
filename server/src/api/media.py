"""Media ingest and sticker search.

``POST /api/media/ingest`` downloads only http(s) URLs already present in
``body.message`` segments (see ``parse_message_segments``). It does not accept
a free-form URL. The plugin dials this process on 127.0.0.1; keep ``chatPort``
on localhost and do not publish it. Fetch itself also refuses private,
loopback, and link-local addresses (including 169.254.169.254).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from src.chat.media.ingest import ingest_message
from src.chat.media.sticker_store import default_store
from src.core.settings import get_settings

router = APIRouter()


class IngestBody(BaseModel):
    group_id: str = Field(..., min_length=1)
    message: dict[str, Any]


@router.post("/api/media/ingest")
async def media_ingest(body: IngestBody):
    settings = get_settings()
    result = await ingest_message(group_id=body.group_id, message=body.message, settings=settings)
    return {"ok": True, **result}


@router.get("/api/stickers/search")
async def stickers_search(q: str = Query(default="")):
    settings = get_settings()
    store = default_store(settings)
    return {"ok": True, "items": store.search(q)}
