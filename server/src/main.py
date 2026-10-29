from __future__ import annotations

from fastapi import FastAPI

from src.api.chat import router as chat_router
from src.api.media import router as media_router
from src.api.tts import router as tts_router


def create_app() -> FastAPI:
    app = FastAPI(title="yoyo-sauce", version="0.1.0")
    app.include_router(chat_router)
    app.include_router(media_router)
    app.include_router(tts_router)
    return app


app = create_app()
