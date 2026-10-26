from __future__ import annotations

from fastapi import APIRouter

from src.chat.mainline import get_mainline_manager
from src.chat.schema import ChatRequest, ChatResponse

router = APIRouter()


@router.get("/api/health")
async def health():
    return {"ok": True, "service": "yoyo-sauce", "role": "chat-brain"}


@router.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    manager = get_mainline_manager()
    data = await manager.handle(req)
    return ChatResponse(code=0, message="ok", data=data)
