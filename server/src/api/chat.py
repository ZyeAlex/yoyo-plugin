from __future__ import annotations

from fastapi import APIRouter, Query

from src.chat.mainline import get_mainline_manager
from src.chat.schema import ChatData, ChatRequest, ChatResponse

router = APIRouter()


@router.get("/api/health")
async def health():
    return {"ok": True, "service": "yoyo-sauce", "role": "chat-brain"}


@router.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    manager = get_mainline_manager()
    data = await manager.handle(req)
    return ChatResponse(code=0, message="ok", data=data)


@router.get("/api/chat/pending", response_model=ChatResponse)
async def chat_pending(session_id: str = Query(..., min_length=3)) -> ChatResponse:
    """拉取 tool_done 等异步写回主线的气泡（插件轮询）。"""
    manager = get_mainline_manager()
    data = manager.drain_pending(session_id)
    if data is None:
        data = ChatData(action="skip", reason="empty")
    return ChatResponse(code=0, message="ok", data=data)
