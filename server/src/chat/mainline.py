from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from src.chat.jobs import new_job_id, run_mock_draw
from src.chat.llm import LLMError, complete, parse_replies_json
from src.chat.persona import load_persona
from src.chat.schema import BusyInfo, BusyTool, ChatData, ChatRequest, ReplyBubble
from src.chat.should_respond import decide, is_draw_intent
from src.core.settings import Settings, get_settings

_logger = logging.getLogger("yoyo.chat.mainline")


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


def _sender_id(message: dict[str, Any]) -> str:
    return str(message.get("user_id") or "")


@dataclass
class OutboxItem:
    turn_gen: int
    replies: list[ReplyBubble]
    reason: str = "outbox"


@dataclass
class GroupMainline:
    session_id: str
    turn_gen: int = 0
    phase: str = "idle"  # idle | thinking | tool_running
    timeline: list[dict[str, Any]] = field(default_factory=list)
    jobs: list[dict[str, Any]] = field(default_factory=list)
    pending_users: list[dict[str, Any]] = field(default_factory=list)
    outbox: list[OutboxItem] = field(default_factory=list)
    reply_timestamps: list[float] = field(default_factory=list)
    last_bot_reply_at: float = 0.0
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    abort_event: asyncio.Event | None = None
    in_flight_task: asyncio.Task | None = None
    job_tasks: dict[str, asyncio.Task] = field(default_factory=dict)

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
            tools=[
                BusyTool(id=str(j["id"]), name=str(j["name"]), status=str(j.get("status") or "running"))
                for j in jobs
            ]
        )

    def note_bot_reply(self) -> None:
        now = time.time()
        self.last_bot_reply_at = now
        self.reply_timestamps.append(now)
        self.reply_timestamps = [t for t in self.reply_timestamps if now - t <= 120.0]

    def push_outbox(self, turn_gen: int, replies: list[ReplyBubble], reason: str = "outbox") -> None:
        if not replies:
            return
        self.outbox.append(OutboxItem(turn_gen=turn_gen, replies=replies, reason=reason))
        self.note_bot_reply()

    def drain_outbox(self) -> list[OutboxItem]:
        items = list(self.outbox)
        self.outbox.clear()
        return items


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

    def drain_pending(self, session_id: str) -> ChatData | None:
        ml = self.get(session_id)
        items = ml.drain_outbox()
        if not items:
            return None
        # 合并多批发件，使用最新 turn_gen
        replies: list[ReplyBubble] = []
        turn = ml.turn_gen
        reason = "outbox"
        for it in items:
            replies.extend(it.replies)
            turn = it.turn_gen
            reason = it.reason
        return ChatData(
            action="reply",
            reason=reason,
            turn_gen=turn,
            busy=ml.busy_info(),
            replies=replies[: self.settings.max_replies * 2],
        )

    async def handle(self, req: ChatRequest) -> ChatData:
        ml = self.get(req.session.session_id)
        text = _message_text(req.message)
        active = self._is_active_initiate(req)
        to_await: asyncio.Task | None = None
        task: asyncio.Task | None = None
        turn = ml.turn_gen

        async with ml.lock:
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
            # 工具进行中 + 主动发起 → 记 pending + ack_busy
            if active and ml.running_jobs():
                ml.phase = "tool_running"
                turn = ml.bump()
                user_ev = {
                    "type": "user",
                    "user": _sender_label(req.message),
                    "user_id": _sender_id(req.message),
                    "text": text,
                    "active": True,
                }
                ml.append_timeline(user_ev, self.settings.timeline_limit)
                ml.pending_users.append(user_ev)
                names = "、".join(j["name"] for j in ml.running_jobs())
                bubble = ReplyBubble(
                    type="text",
                    text=f"别急别急，我正在{names}呢，你先等等~",
                )
                ml.note_bot_reply()
                return ChatData(
                    action="ack_busy",
                    reason="tool_running",
                    turn_gen=turn,
                    busy=ml.busy_info(),
                    replies=[bubble],
                )

            # 工具进行中 + 非主动：只记账，不说话（仍可后续被主线用）
            if ml.running_jobs() and not active:
                ml.append_timeline(
                    {
                        "type": "user",
                        "user": _sender_label(req.message),
                        "user_id": _sender_id(req.message),
                        "text": text,
                        "active": False,
                    },
                    self.settings.timeline_limit,
                )
                # 若像短问也可能想插话，仍进 pending 供画完后处理
                if self.settings.proactive_enabled:
                    action_p, reason_p = decide(
                        hints_at_bot=False,
                        hints_wake_word=False,
                        hints_reply_to_bot=False,
                        text=text,
                        bot_names=self.settings.bot_name_list,
                        proactive_enabled=True,
                        last_bot_reply_at=0,
                        proactive_cooldown_sec=0,
                        reply_timestamps=[],
                        proactive_max_per_min=99,
                    )
                    if action_p == "reply":
                        ml.pending_users.append(
                            {
                                "type": "user",
                                "user": _sender_label(req.message),
                                "user_id": _sender_id(req.message),
                                "text": text,
                                "active": False,
                            }
                        )
                return ChatData(
                    action="skip",
                    reason="tool_running_listen",
                    turn_gen=ml.turn_gen,
                    busy=ml.busy_info(),
                )

            action, reason = decide(
                hints_at_bot=req.hints.at_bot,
                hints_wake_word=req.hints.wake_word,
                hints_reply_to_bot=req.hints.reply_to_bot,
                text=text,
                bot_names=self.settings.bot_name_list,
                proactive_enabled=self.settings.proactive_enabled,
                last_bot_reply_at=ml.last_bot_reply_at,
                proactive_cooldown_sec=self.settings.proactive_cooldown_sec,
                reply_timestamps=ml.reply_timestamps,
                proactive_max_per_min=self.settings.proactive_max_per_min,
            )

            ml.append_timeline(
                {
                    "type": "user",
                    "user": _sender_label(req.message),
                    "user_id": _sender_id(req.message),
                    "text": text,
                    "active": active,
                    "decision": action,
                },
                self.settings.timeline_limit,
            )

            if action == "skip":
                # outbox 由 GET /api/chat/pending 拉取，避免与轮询抢同一批
                return ChatData(action="skip", reason=reason, turn_gen=ml.turn_gen, busy=ml.busy_info())

            # 画画意图：启动异步 job，立即短回，不阻塞
            if (
                self.settings.tools_enabled
                and is_draw_intent(text)
                and (active or reason in {"at_bot", "wake_word", "reply_to_bot", "bot_name"})
            ):
                return await self._start_draw_job(req, ml, text)

            turn = ml.bump()
            abort_event = asyncio.Event()
            ml.abort_event = abort_event
            ml.phase = "thinking"

            task = asyncio.create_task(self._generate(req, ml, text, turn, abort_event, reason=reason))
            ml.in_flight_task = task

        assert task is not None
        try:
            data = await task
            # 附带 outbox（少见）
            async with ml.lock:
                extra = ml.drain_outbox()
            if extra:
                for it in extra:
                    data.replies.extend(it.replies)
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

    async def _start_draw_job(self, req: ChatRequest, ml: GroupMainline, text: str) -> ChatData:
        job_id = new_job_id()
        job = {
            "id": job_id,
            "name": "画画",
            "status": "running",
            "prompt": text,
            "requester": _sender_label(req.message),
            "requester_id": _sender_id(req.message),
            "started_at": time.time(),
        }
        ml.jobs.append(job)
        ml.phase = "tool_running"
        turn = ml.bump()
        ml.append_timeline({"type": "tool_started", "job_id": job_id, "name": "画画"}, self.settings.timeline_limit)

        async def _on_done(jid: str, result: dict[str, Any]) -> None:
            await self._on_tool_done(req.session.session_id, jid, result)

        task = asyncio.create_task(
            run_mock_draw(
                job_id=job_id,
                prompt=text,
                delay_sec=self.settings.draw_mock_delay_sec,
                on_done=_on_done,
            )
        )
        ml.job_tasks[job_id] = task

        bubble = ReplyBubble(type="text", text="好，我画！稍等本公主一会儿~")
        ml.note_bot_reply()
        return ChatData(
            action="reply",
            reason="tool_started",
            turn_gen=turn,
            busy=ml.busy_info(),
            replies=[bubble],
        )

    async def _on_tool_done(self, session_id: str, job_id: str, result: dict[str, Any]) -> None:
        ml = self.get(session_id)
        async with ml.lock:
            job = next((j for j in ml.jobs if j["id"] == job_id), None)
            if not job:
                return
            job["status"] = "done" if result.get("ok") else "failed"
            job["result"] = result
            ml.append_timeline(
                {"type": "tool_done", "job_id": job_id, "name": job.get("name"), "result": result},
                self.settings.timeline_limit,
            )
            pending = list(ml.pending_users)
            ml.pending_users.clear()
            ml.job_tasks.pop(job_id, None)
            if not ml.running_jobs():
                ml.phase = "thinking"
            turn = ml.bump()

        # 锁外调 LLM，避免阻塞入队
        try:
            replies = await self._narrate_tool_done(ml, job, result, pending)
        except Exception as err:
            _logger.warning("narrate tool_done failed: %s", err)
            replies = [
                ReplyBubble(
                    type="text",
                    text=f"{job.get('requester') or '你'}，画好了！" if result.get("ok") else "画画失败了，待会再试~",
                    mention=str(job.get("requester_id") or "") or None,
                )
            ]
            if pending:
                p = pending[0]
                replies.append(
                    ReplyBubble(
                        type="text",
                        text=f"{p.get('user')}还在吗，本公主忙完啦，需要我继续帮忙吗",
                        mention=str(p.get("user_id") or "") or None,
                    )
                )

        async with ml.lock:
            if result.get("ok") and result.get("path"):
                replies.insert(
                    1 if replies else 0,
                    ReplyBubble(type="image", path=str(result["path"])),
                )
            elif result.get("ok") and result.get("caption"):
                # 无真实图片时用说明气泡
                if not any(r.type == "image" for r in replies):
                    replies.insert(
                        min(1, len(replies)),
                        ReplyBubble(type="text", text=str(result["caption"])),
                    )
            ml.push_outbox(turn, replies[: self.settings.max_replies * 2], reason="tool_done")
            ml.phase = "idle" if not ml.running_jobs() else "tool_running"
            ml.append_timeline(
                {"type": "bot", "replies": [r.model_dump() for r in replies], "turn_gen": turn},
                self.settings.timeline_limit,
            )

    async def _narrate_tool_done(
        self,
        ml: GroupMainline,
        job: dict[str, Any],
        result: dict[str, Any],
        pending: list[dict[str, Any]],
    ) -> list[ReplyBubble]:
        persona = load_persona()
        pending_lines = "\n".join(f"- {p.get('user')}: {p.get('text')}" for p in pending) or "（无）"
        status = "成功" if result.get("ok") else f"失败：{result.get('error')}"
        prompt = (
            f"{persona}\n\n"
            "【主线任务】异步工具刚完成，请在同一条群聊主线上收尾，不要另开话题会话。\n"
            f"工具：{job.get('name')}（{status}）\n"
            f"发起人：{job.get('requester')}\n"
            f"原始请求：{job.get('prompt')}\n"
            f"工具结果摘要：{result.get('caption') or result}\n"
            f"等待中的其他人：\n{pending_lines}\n\n"
            "要求：先用短句告诉发起人画好了（或失败），再点名等待的人问是否还要帮忙。"
            "输出 JSON {\"replies\":[{\"type\":\"text\",\"text\":\"...\",\"mention\":\"可选user_id\"}]}，最多 4 条。"
        )
        if not self.settings.llm_configured:
            replies = [
                ReplyBubble(
                    type="text",
                    text=f"{job.get('requester')}，终于画好啦，给你~" if result.get("ok") else "画画失败了…",
                    mention=str(job.get("requester_id") or "") or None,
                )
            ]
            if pending:
                p = pending[0]
                replies.append(
                    ReplyBubble(
                        type="text",
                        text=f"{p.get('user')}还在吗，本公主忙完啦，需要我继续帮忙吗",
                        mention=str(p.get("user_id") or "") or None,
                    )
                )
            return replies

        raw = await self._llm_complete(
            [{"role": "user", "content": prompt}],
            self.settings,
            abort_event=None,
        )
        bubbles = parse_replies_json(raw, max_replies=4)
        return [ReplyBubble.model_validate(b) for b in bubbles] or [
            ReplyBubble(type="text", text="画好啦~"),
        ]

    async def _generate(
        self,
        req: ChatRequest,
        ml: GroupMainline,
        text: str,
        turn: int,
        abort_event: asyncio.Event,
        *,
        reason: str = "llm",
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
            ml.note_bot_reply()
            return ChatData(action="reply", reason=reason, turn_gen=turn, replies=replies)
        except LLMError as err:
            if "aborted" in str(err).lower() or abort_event.is_set():
                return ChatData(action="skip", reason="aborted", turn_gen=turn, aborted=True)
            _logger.warning("llm failed: %s", err)
            if self._is_active_initiate(req) or reason.startswith("proactive"):
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
        for ev in ml.timeline[-20:]:
            typ = ev.get("type")
            if typ == "user":
                timeline_lines.append(f"{ev.get('user')}: {ev.get('text')}")
            elif typ == "bot":
                texts = []
                for r in ev.get("replies") or []:
                    if isinstance(r, dict) and r.get("text"):
                        texts.append(str(r["text"]))
                if texts:
                    timeline_lines.append("悠悠: " + " / ".join(texts))
            elif typ == "tool_started":
                timeline_lines.append(f"[工具开始] {ev.get('name')}")
            elif typ == "tool_done":
                timeline_lines.append(f"[工具完成] {ev.get('name')}")

        jobs = ml.running_jobs()
        busy = "、".join(j["name"] for j in jobs) if jobs else "无"

        user_payload = (
            "【近期群聊】\n"
            + ("\n".join(recent_lines) or "（无）")
            + "\n\n【主线摘要】\n"
            + ("\n".join(timeline_lines) or "（无）")
            + f"\n\n【进行中工具】{busy}\n"
            + f"【当前消息】{_sender_label(req.message)}: {text}\n"
            + "请按 persona 用 JSON replies 回复（短句、像群友）。"
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
