from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from src.chat.tts.client import synthesize_speech
from src.chat.tts.voice import clear_default_voice, default_voice_status, save_default_voice
from src.core.settings import get_settings

router = APIRouter()


class PreviewBody(BaseModel):
    text: str = Field(default="你好，我是悠悠。", min_length=1, max_length=200)


class VoiceUploadBody(BaseModel):
    """Base64 audio for panel proxy without multipart through Python."""

    audio_base64: str = Field(..., min_length=8)
    filename: str = Field(default="default.wav")
    prompt_text: str = Field(default="")


@router.get("/api/tts/voice")
async def tts_voice_status():
    return {"ok": True, **default_voice_status()}


@router.post("/api/tts/voice")
async def tts_voice_upload(body: VoiceUploadBody):
    import base64

    try:
        raw = base64.b64decode(body.audio_base64, validate=False)
    except Exception as err:
        raise HTTPException(status_code=400, detail=f"invalid base64: {err}") from err
    if len(raw) < 64:
        raise HTTPException(status_code=400, detail="audio too small")
    if len(raw) > 8_000_000:
        raise HTTPException(status_code=400, detail="audio too large")
    info = save_default_voice(raw, filename=body.filename or "default.wav", prompt_text=body.prompt_text)
    return {"ok": True, **info}


@router.delete("/api/tts/voice")
async def tts_voice_clear():
    clear_default_voice()
    return {"ok": True, **default_voice_status()}


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
