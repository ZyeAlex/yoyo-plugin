from __future__ import annotations

from fastapi import FastAPI

from src.api.chat import router as chat_router


def create_app() -> FastAPI:
    app = FastAPI(title="yoyo-sauce", version="0.1.0")
    app.include_router(chat_router)
    return app


app = create_app()
