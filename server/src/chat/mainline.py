from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field
from typing import Any

from src.chat.llm import LLMError, complete, parse_replies_json
from src.chat.persona import load_persona
from src.chat.schema import BusyInfo, BusyTool, ChatData, ChatRequest, ReplyBubble
from src.chat.should_respond import decide
from src.core.settings import Settings, get_settings

_logger = logging.getLogger("yoyo.chat.mainline")

_TEXT_SEG = re.compile(r".+")


def _message_text(message: dict[str, Any]) -> str:
    if not message:
        return ""
    if isinstance(message.get("raw_message"), str) and message["raw_message"].strip():
        return message["raw_message"].strip()
    segs = message.get("message")
    if isinstance(segs, list):
        parts: list[str] = []
        for seg in segs:
            if not isinstance(seg, dict):
                continue
            if seg.get("type") == "text":
                parts.append(str(seg.get("text") or ""))
            elif seg.get("type") == "at":
                parts.append(f"@{seg.get('qq') or seg.get('text') or ''}")
        return "".join(parts).strip()
    if isinstance(message.get("text"), str):
        return message["text"].strip()
    return ""


def _sender_label(message: dict[str, Any]) -> str:
    sender = message.get("sender") or {}
    if isinstance(sender, dict):
        return str(sender.get("card") or sender.get("nickname") or message.get("user_id") or "?")
    return str(message.get("user_id") or "?")


@dataclass
class GroupMainline:
    session_id: str
    turn_gen: int = 0
    phase: str = "idle"  # idle | thinking | tool_running
    timeline: list[dict[str, Any]] = field(default_factory=list)
    jobs: list[dict[str, Any]] = field(default_factory=list)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    abort_event: asyncio.Event | None = None
    in_flight_task: asyncio.Task | None = None

    def bump(self) -> int:
        self.turn_gen += 1
        return self.turn_gen

    def append_timeline(self, event: dict[str, Any], limit: int) -> None:
        self.timeline.append(event)
        if len(self.timeline) > limit:
            self.timeline = self.timeline[-limit:]

    def running_jobs(self) -> list[dict[str, Any]]:
        return [j for j in self.jobs if j.get("status") == "running"]

    def busy_info(self) -> BusyInfo | None:
        jobs = self.running_jobs()
        if not jobs:
            return None
        return BusyInfo(
            tools=[BusyTool(id=str(j["id"]), name=str(j["name"]), status=str(j.get("status") or "running")) for j in jobs]
        )


class MainlineManager:
    def __init__(self, settings: Settings | None = None, llm_complete=None):
        self.settings = settings or get_settings()
        self._sessions: dict[str, GroupMainline] = {}
        self._llm_complete = llm_complete or complete

    def get(self, session_id: str) -> GroupMainline:
        if session_id not in self._sessions:
            self._sessions[session_id] = GroupMainline(session_id=session_id)
        return self._sessions[session_id]

    def _is_active_initiate(self, req: ChatRequest) -> bool:
        h = req.hints
        return bool(h.at_bot or h.wake_word or h.reply_to_bot)

    async def handle(self, req: ChatRequest) -> ChatData:
        ml = self.get(req.session.session_id)
        text = _message_text(req.message)
        active = self._is_active_initiate(req)
        to_await: asyncio.Task | None = None
        task: asyncio.Task | None = None
        turn = ml.turn_gen

        async with ml.lock:
            # 主动发起 + thinking → 打断当前 LLM（持锁内只发信号，不 await，避免死锁）
            if (
                active
                and self.settings.interrupt_enabled
                and ml.phase == "thinking"
                and ml.abort_event is not None
            ):
                ml.abort_event.set()
                if ml.in_flight_task and not ml.in_flight_task.done():
                    to_await = ml.in_flight_task
                    ml.in_flight_task.cancel()
                ml.phase = "idle"
                ml.abort_event = None
                ml.in_flight_task = None
                _logger.info("interrupted thinking session=%s", req.session.session_id)

        if to_await is not None:
            try:
                await to_await
            except (asyncio.CancelledError, Exception):
                pass

        async with ml.lock:

            # 工具进行中 + 主动发起 → ack_busy（MVP-1：无真实工具时仅当 jobs 非空）
            if active and ml.running_jobs():
                ml.phase = "tool_running"
                turn = ml.bump()
                ml.append_timeline(
                    {
                        "type": "user",
                        "user": _sender_label(req.message),
                        "text": text,
                        "active": True,
                    },
                    self.settings.timeline_limit,
                )
                names = "、".join(j["name"] for j in ml.running_jobs())
                bubble = ReplyBubble(
                    type="text",
                    text=f"别急别急，我正在{names}呢，你先等等~",
                )
                return ChatData(
                    action="ack_busy",
                    reason="tool_running",
                    turn_gen=turn,
                    busy=ml.busy_info(),
                    replies=[bubble],
                )

            action, reason = decide(
                hints_at_bot=req.hints.at_bot,
                hints_wake_word=req.hints.wake_word,
                hints_reply_to_bot=req.hints.reply_to_bot,
                text=text,
                bot_names=self.settings.bot_name_list,
            )

            ml.append_timeline(
                {
                    "type": "user",
                    "user": _sender_label(req.message),
                    "text": text,
                    "active": active,
                    "decision": action,
                },
                self.settings.timeline_limit,
            )

            if action == "skip":
                return ChatData(action="skip", reason=reason, turn_gen=ml.turn_gen)

            turn = ml.bump()
            abort_event = asyncio.Event()
            ml.abort_event = abort_event
            ml.phase = "thinking"

            task = asyncio.create_task(self._generate(req, ml, text, turn, abort_event))
            ml.in_flight_task = task

        assert task is not None
        try:
            data = await task
            return data
        except asyncio.CancelledError:
            return ChatData(action="skip", reason="aborted", turn_gen=turn, aborted=True)
        finally:
            async with ml.lock:
                if ml.in_flight_task is task:
                    ml.in_flight_task = None
                    ml.abort_event = None
                    if ml.phase == "thinking":
                        ml.phase = "idle" if not ml.running_jobs() else "tool_running"

    async def _generate(
        self,
        req: ChatRequest,
        ml: GroupMainline,
        text: str,
        turn: int,
        abort_event: asyncio.Event,
    ) -> ChatData:
        try:
            messages = self._build_messages(req, ml, text)
            raw = await self._llm_complete(messages, self.settings, abort_event=abort_event)
            if abort_event.is_set():
                return ChatData(action="skip", reason="aborted", turn_gen=turn, aborted=True)
            bubbles = parse_replies_json(raw, max_replies=self.settings.max_replies)
            replies = [ReplyBubble.model_validate(b) for b in bubbles]
            if not replies:
                replies = [ReplyBubble(type="text", text="嗯？再说一次呗~")]
            ml.append_timeline(
                {"type": "bot", "replies": [r.model_dump() for r in replies], "turn_gen": turn},
                self.settings.timeline_limit,
            )
            return ChatData(action="reply", reason="llm", turn_gen=turn, replies=replies)
        except LLMError as err:
            if "aborted" in str(err).lower() or abort_event.is_set():
                return ChatData(action="skip", reason="aborted", turn_gen=turn, aborted=True)
            _logger.warning("llm failed: %s", err)
            if self._is_active_initiate(req):
                return ChatData(
                    action="reply",
                    reason="llm_error",
                    turn_gen=turn,
                    replies=[ReplyBubble(type="text", text="刚才脑子短路了一下，稍后再找我~")],
                )
            return ChatData(action="skip", reason="llm_error", turn_gen=turn)

    def _build_messages(self, req: ChatRequest, ml: GroupMainline, text: str) -> list[dict[str, Any]]:
        persona = load_persona()
        recent_lines: list[str] = []
        for item in (req.recent or [])[-12:]:
            if not isinstance(item, dict):
                continue
            u = ""
            sender = item.get("sender") or {}
            if isinstance(sender, dict):
                u = str(sender.get("card") or sender.get("nickname") or item.get("user_id") or "")
            body = item.get("raw_message") or _message_text(item)
            if body:
                recent_lines.append(f"{u}: {body}")

        timeline_lines: list[str] = []
        for ev in ml.timeline[-16:]:
            if ev.get("type") == "user":
                timeline_lines.append(f"{ev.get('user')}: {ev.get('text')}")
            elif ev.get("type") == "bot":
                texts = []
                for r in ev.get("replies") or []:
                    if isinstance(r, dict) and r.get("text"):
                        texts.append(str(r["text"]))
                if texts:
                    timeline_lines.append("悠悠: " + " / ".join(texts))

        user_payload = (
            "【近期群聊】\n"
            + ("\n".join(recent_lines) or "（无）")
            + "\n\n【主线摘要】\n"
            + ("\n".join(timeline_lines) or "（无）")
            + f"\n\n【当前消息】{_sender_label(req.message)}: {text}\n"
            + "请按 persona 用 JSON replies 回复。"
        )
        return [
            {"role": "system", "content": persona},
            {"role": "user", "content": user_payload},
        ]


_manager: MainlineManager | None = None


def get_mainline_manager() -> MainlineManager:
    global _manager
    if _manager is None:
        _manager = MainlineManager()
    return _manager


def reset_mainline_manager_for_tests(manager: MainlineManager | None = None) -> MainlineManager:
    global _manager
    _manager = manager if manager is not None else MainlineManager()
    return _manager
