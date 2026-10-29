from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from src.chat.mainline import get_mainline_manager
from src.chat.memory.retrieve import index_texts
from src.chat.memory.store import get_memory_store
from src.chat.memory.vector_store import get_vector_store
from src.chat.schema import ChatData, ChatRequest, ChatResponse
from src.core.settings import get_settings

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
        # 空轮询也带 busy，避免静默 TTS/旁听时插件误判空闲停轮询
        ml = manager.get(session_id)
        busy = ml.busy_info()
        data = ChatData(
            action="skip",
            reason="empty",
            turn_gen=ml.turn_gen,
            busy=busy if busy.tools else None,
        )
    return ChatResponse(code=0, message="ok", data=data)


class ReindexBody(BaseModel):
    group_id: str = Field(..., min_length=1)


@router.post("/api/memory/reindex")
async def memory_reindex(body: ReindexBody):
    """主人运维：重建某群向量索引（本机）。"""
    settings = get_settings()
    store = get_memory_store()
    gid = body.group_id.strip()
    vec = get_vector_store()
    vec.clear_group(gid)
    items: list[tuple[str, str, str]] = []
    for i, ln in enumerate(store.load_group_profile(gid).splitlines()):
        ln = ln.strip()
        if ln:
            items.append(("group", f"p-{i}", ln))
    for day, content in store.load_recent_dailies(gid, days=14):
        for j, ln in enumerate(content.splitlines()):
            ln = ln.strip().lstrip("- ").strip()
            if ln:
                items.append(("daily", f"{day}-{j}", ln[:500]))
    for s in store.load_slang(gid):
        term = str(s.get("term") or "")
        meaning = str(s.get("meaning") or "")
        if term and meaning:
            items.append(("slang", term, f"{term}={meaning}"))
    n = await index_texts(settings, gid, items, vector=vec)
    return {"ok": True, "group_id": gid, "indexed": n, "candidates": len(items)}
