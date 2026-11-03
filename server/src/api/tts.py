from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from src.chat.tts.client import synthesize_speech
from src.core.settings import get_settings

router = APIRouter()


class PreviewBody(BaseModel):
    text: str = Field(default="你好，我是悠悠。", min_length=1, max_length=200)


@router.post("/api/tts/preview")
async def tts_preview(body: PreviewBody):
    settings = get_settings()
    try:
        audio = await synthesize_speech(text=body.text, settings=settings)
    except Exception as err:
        raise HTTPException(status_code=502, detail=str(err)[:300]) from err
    fmt = (settings.chat_tts_format or "wav").strip().lower() or "wav"
    media = "audio/mpeg" if fmt == "mp3" else "audio/wav"
    return Response(content=audio, media_type=media)
