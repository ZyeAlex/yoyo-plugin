from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class SessionInfo(BaseModel):
    session_id: str
    group_id: str = ""
    bot_id: str = ""
    bot_nickname: str = "悠悠"
    group_name: str = ""


class ChatHints(BaseModel):
    at_bot: bool = False
    wake_word: bool = False
    reply_to_bot: bool = False


class ChatRequest(BaseModel):
    request_id: str
    session: SessionInfo
    message: dict[str, Any] = Field(default_factory=dict)
    recent: list[dict[str, Any]] = Field(default_factory=list)
    hints: ChatHints = Field(default_factory=ChatHints)


class ReplyBubble(BaseModel):
    type: Literal["text", "image", "record"] = "text"
    text: str | None = None
    path: str | None = None
    mention: str | None = None
    sticker_desc: str | None = None


class BusyTool(BaseModel):
    id: str
    name: str
    status: str = "running"


class BusyInfo(BaseModel):
    tools: list[BusyTool] = Field(default_factory=list)


class ChatData(BaseModel):
    action: Literal["skip", "reply", "ack_busy"] = "skip"
    reason: str = ""
    turn_gen: int = 0
    busy: BusyInfo | None = None
    replies: list[ReplyBubble] = Field(default_factory=list)
    aborted: bool = False


class ChatResponse(BaseModel):
    code: int = 0
    message: str = "ok"
    data: ChatData = Field(default_factory=ChatData)
