from __future__ import annotations

import asyncio
import logging
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from src.chat.jobs import new_job_id, run_mock_draw
from src.chat.llm import LLMError, complete, parse_replies_json
from src.chat.media.segments import (
    effective_text,
    parse_message_segments,
    render_media_placeholders,
)
from src.chat.media.sticker_store import default_store
from src.chat.media.vision import build_user_content, is_referring, select_vision_urls
from src.chat.memory.assembler import build_memory_context
from src.chat.memory.extract import schedule_extract_memory
from src.chat.memory.store import get_memory_store
from src.chat.outbound import sanitize_outgoing
from src.chat.persona import load_persona
from src.chat.schema import BusyInfo, BusyTool, ChatData, ChatRequest, ReplyBubble
from src.chat.should_respond import decide, is_draw_intent, is_game_command
from src.chat.temperature import (
    HeatState,
    is_hard_trigger,
    is_mute,
    load_heat,
    mark_leave,
    mark_silent,
    mark_spoken,
    on_incoming,
    parse_judge,
    rule_score,
    save_heat,
)
from src.chat.transcript import (
    append_transcript,
    load_transcript_lines,
    render_cq_string,
    transcript_line,
    visible_text,
)
from src.core.settings import Settings, get_settings

_logger = logging.getLogger("yoyo.chat.mainline")

_REMEMBER_RE = re.compile(r"^(?:记住|记得)[:：]\s*(.+)$", re.S)
_FORGET_RE = re.compile(r"^(?:忘记|忘掉)[:：]\s*(.+)$", re.S)
_DOU_TU_RE = re.compile(r"斗图|来张|接一个|表情包|发个.*表情")

# server/src/chat/mainline.py → parents[2] is server/
_SERVER_ROOT = Path(__file__).resolve().parents[2]
_OUTBOUND_IMAGE_ROOTS = (
    _SERVER_ROOT / "data" / "stickers",
    _SERVER_ROOT / "data" / "media",
)


@dataclass
class ShelfItem:
    id: str
    hash: str
    path: str
    caption: str
    emotions: list[str] = field(default_factory=list)


def _confined_image_path(path: str) -> str | None:
    """Absolute path under data/stickers or data/media, or None."""
    raw = str(path or "").strip()
    if not raw or "://" in raw:
        return None
    try:
        resolved = Path(raw).expanduser().resolve(strict=False)
    except (OSError, RuntimeError, ValueError):
        return None
    for root in _OUTBOUND_IMAGE_ROOTS:
        try:
            base = root.resolve(strict=False)
            if resolved == base:
                return None
            resolved.relative_to(base)
        except (OSError, ValueError):
            continue
        return str(resolved)
    return None


def _with_media_placeholders(message: dict[str, Any] | None, body: str) -> str:
    ph = render_media_placeholders(parse_message_segments(message if isinstance(message, dict) else None))
    text = (body or "").strip()
    if ph and text:
        return f"{text} {ph}"
    return ph or text


def wants_dou_tu(*, text: str, message: dict[str, Any] | None, recent: list | None) -> bool:
    if _DOU_TU_RE.search(text or ""):
        return True
    if any(r.kind == "sticker" for r in parse_message_segments(message or {})):
        return True
    for item in recent or []:
        if not isinstance(item, dict):
            continue
        if any(r.kind == "sticker" for r in parse_message_segments(item)):
            return True
        body = item.get("raw_message") or _message_text(item)
        if _DOU_TU_RE.search(str(body or "")):
            return True
    return False


def _shelf_emotions(tags: dict[str, Any] | None) -> list[str]:
    if not isinstance(tags, dict):
        return []
    return [str(x).strip() for x in (tags.get("emotion") or []) if str(x).strip()][:3]


def build_sticker_shelf(
    store,
    settings,
    *,
    text: str,
    message: dict[str, Any] | None,
    recent: list | None,
) -> list[ShelfItem]:
    if not getattr(settings, "chat_sticker_reply_enabled", True):
        return []
    if not getattr(settings, "chat_sticker_shelf_enabled", True):
        return []
    if store is None:
        return []
    if not wants_dou_tu(text=text, message=message, recent=recent):
        return []
    limit = max(1, int(getattr(settings, "chat_sticker_shelf_size", 5) or 5))
    picked: list[dict[str, Any]] = []
    seen: set[str] = set()
    try:
        for hit in store.search(text or "", limit=limit) or []:
            if not isinstance(hit, dict):
                continue
            digest = str(hit.get("hash") or "")
            path = _confined_image_path(str(hit.get("path") or ""))
            if not digest or not path or digest in seen:
                continue
            seen.add(digest)
            picked.append(hit)
    except Exception as err:
        _logger.warning("sticker shelf search failed: %s", err)
    if len(picked) < limit:
        shelf_fn = getattr(store, "shelf", None)
        if callable(shelf_fn):
            try:
                for hit in shelf_fn(limit=limit, exclude_hashes=seen) or []:
                    if not isinstance(hit, dict):
                        continue
                    digest = str(hit.get("hash") or "")
                    path = _confined_image_path(str(hit.get("path") or ""))
                    if not digest or not path or digest in seen:
                        continue
                    seen.add(digest)
                    picked.append(hit)
                    if len(picked) >= limit:
                        break
            except Exception as err:
                _logger.warning("sticker shelf() failed: %s", err)
    out: list[ShelfItem] = []
    for i, hit in enumerate(picked[:limit], start=1):
        tags = hit.get("tags") if isinstance(hit.get("tags"), dict) else {}
        caption = str(hit.get("caption") or "").strip()
        if not caption:
            from src.chat.media.sticker_store import short_caption

            caption = short_caption(tags)
        out.append(
            ShelfItem(
                id=f"s{i}",
                hash=str(hit.get("hash") or ""),
                path=str(_confined_image_path(str(hit.get("path") or "")) or ""),
                caption=caption or "表情",
                emotions=_shelf_emotions(tags),
            )
        )
    return [x for x in out if x.path and x.hash]


def format_shelf_prompt(items: list[ShelfItem]) -> str:
    if not items:
        return (
            "\n【可发表情】货架为空：不要承诺发图；不要输出 sticker，只用文字。"
        )
    lines = ["\n【可发表情·本轮最多选 1 张】"]
    for it in items:
        emo = "/".join(it.emotions) if it.emotions else ""
        extra = f"｜{emo}" if emo else ""
        lines.append(f"- {it.id} {it.caption}{extra}")
    lines.append(
        '规则：用 {"type":"sticker","id":"s1"} 选一张；没有合适用 {"type":"sticker","id":"none"}。'
        "禁止说「发了」却不选 id；禁止编造 id。"
    )
    return "\n".join(lines)


def resolve_sticker_bubbles(
    raw_bubbles,
    store,
    settings,
    *,
    shelf_items: list[ShelfItem] | None = None,
) -> list[ReplyBubble]:
    """Map text + sticker.id (from this-turn shelf) to outbound bubbles. Policy B: no auto pick."""
    enabled = bool(getattr(settings, "chat_sticker_reply_enabled", True))
    max_stickers = max(0, int(getattr(settings, "chat_sticker_max_per_reply", 1) or 0))
    shelf = list(shelf_items or [])
    by_id = {it.id: it for it in shelf}
    out: list[ReplyBubble] = []
    added = 0
    used_hashes: set[str] = set()

    def _emit(item: ShelfItem, mention=None) -> bool:
        nonlocal added
        if not enabled or added >= max_stickers:
            return False
        path = _confined_image_path(item.path)
        if not path or item.hash in used_hashes:
            return False
        out.append(
            ReplyBubble(
                type="image",
                path=path,
                mention=mention,
                sticker_desc=item.caption or "表情",
            )
        )
        used_hashes.add(item.hash)
        added += 1
        if store is not None:
            try:
                store.mark_used(item.hash)
            except Exception as err:
                _logger.warning("sticker mark_used failed: %s", err)
        return True

    def _match_query_on_shelf(query: str) -> ShelfItem | None:
        q = (query or "").strip().lower()
        if not q or not shelf:
            return None
        for it in shelf:
            hay = f"{it.caption} {' '.join(it.emotions)}".lower()
            if q in hay or any(tok and tok in hay for tok in q.split()):
                return it
        return None

    for item in list(raw_bubbles or []):
        if not isinstance(item, dict):
            continue
        typ = item.get("type") or "text"
        if typ == "sticker":
            if not enabled:
                continue
            sid = str(item.get("id") or "").strip().lower()
            if sid in {"", "none"}:
                continue
            if sid in by_id:
                _emit(by_id[sid], item.get("mention"))
                continue
            # 兼容旧 query：仅在本轮货架内匹配，匹配不到不发（策略 B）
            query = str(item.get("query") or "").strip()
            hit = _match_query_on_shelf(query)
            if hit:
                _emit(hit, item.get("mention"))
            continue
        if typ == "image":
            path = _confined_image_path(str(item.get("path") or ""))
            if path:
                out.append(ReplyBubble(type="image", path=path, mention=item.get("mention")))
            continue
        t = str(item.get("text") or "").strip()
        if t:
            out.append(ReplyBubble(type="text", text=t, mention=item.get("mention")))

    return out


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


def _chat_visible_text(message: dict[str, Any] | None) -> str:
    """正文给热度/指令用：纯媒体消息返回空，避免 raw「[图片]」误触游戏指令。"""
    message = message if isinstance(message, dict) else {}
    text = effective_text(message)
    if text:
        return text
    segs = message.get("message")
    has_text_seg = False
    if isinstance(segs, list):
        for seg in segs:
            if not isinstance(seg, dict):
                continue
            if seg.get("type") == "text" and str(seg.get("text") or "").strip():
                has_text_seg = True
                break
    refs = parse_message_segments(message)
    has_media = any(r.kind in {"photo", "sticker", "mface", "face"} for r in refs)
    if has_media and not has_text_seg:
        return ""
    return (_message_text(message) or "").strip()


def _sender_label(message: dict[str, Any]) -> str:
    sender = message.get("sender") or {}
    if isinstance(sender, dict):
        return str(sender.get("card") or sender.get("nickname") or message.get("user_id") or "?")
    return str(message.get("user_id") or "?")


def _sender_id(message: dict[str, Any]) -> str:
    return str(message.get("user_id") or "")


def _group_id_from_session(session_id: str) -> str:
    # group:{gid}:bot:{bid}
    parts = (session_id or "").split(":")
    if len(parts) >= 2 and parts[0] == "group":
        return parts[1]
    return ""


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
    heat: HeatState | None = None
    warm_token: int = 0
    warm_task: asyncio.Task | None = None

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
    def __init__(self, settings: Settings | None = None, llm_complete=None, sticker_store=None):
        self.settings = settings or get_settings()
        self._sessions: dict[str, GroupMainline] = {}
        self._llm_complete = llm_complete or complete
        self._sticker_store = sticker_store
        self._preloaded: set[str] = set()

    def _sticker_index(self):
        if self._sticker_store is not None:
            return self._sticker_store
        if not getattr(self.settings, "chat_sticker_reply_enabled", True):
            return None
        return default_store(self.settings)

    def get(self, session_id: str, *, group_id: str = "") -> GroupMainline:
        if session_id not in self._sessions:
            ml = GroupMainline(session_id=session_id)
            self._sessions[session_id] = ml
            gid = group_id or _group_id_from_session(session_id)
            if gid and session_id not in self._preloaded:
                self._preload_session(ml, gid)
                self._preloaded.add(session_id)
        return self._sessions[session_id]

    def _preload_session(self, ml: GroupMainline, group_id: str) -> None:
        if not self.settings.chat_memory_enabled:
            return
        try:
            store = get_memory_store()
            turns = store.load_session(
                group_id, max_turns=int(self.settings.chat_session_history_turns or 20)
            )
            for row in turns:
                uid = str(row.get("user_id") or "")
                ml.append_timeline(
                    {
                        "type": "user",
                        "user": uid or "?",
                        "user_id": uid,
                        "text": str(row.get("user_text") or ""),
                        "active": True,
                        "from_disk": True,
                    },
                    self.settings.timeline_limit,
                )
                replies = row.get("bot_replies") or []
                if replies:
                    ml.append_timeline(
                        {
                            "type": "bot",
                            "replies": [{"type": "text", "text": str(t)} for t in replies],
                            "from_disk": True,
                        },
                        self.settings.timeline_limit,
                    )
            if turns:
                _logger.info("preloaded %d session turns for group %s", len(turns), group_id)
        except Exception as e:
            _logger.warning("session preload failed: %s", e)

    def _is_active_initiate(self, req: ChatRequest) -> bool:
        h = req.hints
        return bool(h.at_bot or h.wake_word or h.reply_to_bot)

    def _group_of(self, req: ChatRequest) -> str:
        return req.session.group_id or _group_id_from_session(req.session.session_id)

    def _archive_user(self, req: ChatRequest) -> None:
        gid = self._group_of(req)
        if not gid:
            return
        try:
            line = transcript_line(req.message)
            if line:
                append_transcript(gid, line)
        except Exception as err:
            _logger.warning("transcript append failed: %s", err)

    def _archive_bot(self, group_id: str, replies: list[ReplyBubble]) -> None:
        if not group_id:
            return
        parts: list[str] = []
        for r in replies:
            if r.type == "text" and r.text and r.text.strip():
                parts.append(r.text.strip())
            elif r.type == "image":
                desc = (r.sticker_desc or "").strip() or "表情"
                parts.append(f"[表情包 {desc}]")
        if not parts:
            return
        try:
            append_transcript(group_id, "悠悠: " + " / ".join(parts))
        except Exception as err:
            _logger.warning("transcript bot append failed: %s", err)

    def _ensure_heat(self, ml: GroupMainline, req: ChatRequest) -> HeatState:
        if ml.heat is None:
            gid = self._group_of(req)
            ml.heat = load_heat(gid) if gid else HeatState()
        return ml.heat

    def _save_group_heat(self, req: ChatRequest, state: HeatState) -> None:
        gid = self._group_of(req)
        if not gid:
            return
        try:
            save_heat(gid, state)
        except Exception as err:
            _logger.warning("heat save failed: %s", err)

    def _mark_heat_spoken(self, req: ChatRequest, ml: GroupMainline) -> None:
        state = self._ensure_heat(ml, req)
        mark_spoken(
            state,
            time.time(),
            warm_sec=float(self.settings.chat_heat_warm_sec),
            warm_msgs=int(self.settings.chat_heat_warm_msgs),
        )
        self._save_group_heat(req, state)

    def _cancel_warm(self, ml: GroupMainline) -> None:
        ml.warm_token += 1
        task = ml.warm_task
        ml.warm_task = None
        if task is not None and not task.done():
            task.cancel()

    def _schedule_warm(self, req: ChatRequest, ml: GroupMainline) -> None:
        ml.warm_token += 1
        token = ml.warm_token
        old = ml.warm_task
        if old is not None and not old.done():
            old.cancel()
        ml.warm_task = asyncio.create_task(self._warm_later(req, token))

    async def _choose_action(self, req: ChatRequest, ml: GroupMainline, text: str) -> tuple[str, str]:
        if is_game_command(text):
            return "skip", "game_command"
        if not self.settings.chat_heat_enabled:
            return decide(
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
        names = self.settings.bot_name_list
        hard = is_hard_trigger(
            text,
            at_bot=req.hints.at_bot,
            wake=req.hints.wake_word,
            reply_to=req.hints.reply_to_bot,
            names=names,
        )
        if is_mute(text):
            state = self._ensure_heat(ml, req)
            on_incoming(
                state,
                score=0.0,
                now=time.time(),
                hard=False,
                muted=True,
                debounce_sec=0,
            )
            self._save_group_heat(req, state)
            self._cancel_warm(ml)
            return "skip", "mute"
        if not hard and not self.settings.proactive_enabled:
            return "skip", "no_trigger"
        state = self._ensure_heat(ml, req)
        kind = on_incoming(
            state,
            score=rule_score(text, hard=hard),
            now=time.time(),
            hard=hard,
            muted=False,
            debounce_sec=float(self.settings.chat_heat_debounce_sec or 0),
        )
        self._save_group_heat(req, state)
        if kind == "reply":
            if req.hints.at_bot:
                return "reply", "at_bot"
            if req.hints.wake_word:
                return "reply", "wake_word"
            if req.hints.reply_to_bot:
                return "reply", "reply_to_bot"
            return "reply", "bot_name"
        if kind == "hold":
            self._schedule_warm(req, ml)
            return "skip", "hold"
        if kind == "backoff":
            return "skip", "cold_backoff"
        if kind == "batch":
            return "skip", "cold_batch"
        judged = await self._judge(req, ml)
        if judged == "reply":
            return "reply", "heat_reply"
        if judged == "leave":
            mark_leave(state)
            self._save_group_heat(req, state)
            return "skip", "heat_leave"
        mark_silent(state, time.time())
        self._save_group_heat(req, state)
        return "skip", "heat_silent"

    async def _judge(self, req: ChatRequest, ml: GroupMainline) -> str:
        if not self.settings.llm_configured:
            return "silent"
        gid = self._group_of(req)
        lines = load_transcript_lines(gid) if gid else []
        blob = "\n".join(lines[-20:]) or "（无）"
        prompt = (
            "【要不要接话】你在判断群友「悠悠」现在该不该说话。\n"
            "只输出 JSON：{\"action\":\"reply\"} 或 {\"action\":\"silent\"} 或 {\"action\":\"leave\"}。\n"
            "reply=她会对这段感兴趣并接话；silent=先听着；"
            "leave=话题已经和她无关，或有人不想让她说。\n"
            f"【最近群聊】\n{blob}"
        )
        try:
            raw = await self._llm_complete(
                [{"role": "user", "content": prompt}],
                self.settings.profile("fast"),
                abort_event=None,
            )
        except Exception as err:
            _logger.warning("heat judge failed: %s", err)
            return "silent"
        return parse_judge(raw)

    async def _warm_later(self, req: ChatRequest, token: int) -> None:
        try:
            await asyncio.sleep(max(0.05, float(self.settings.chat_heat_debounce_sec or 0)))
        except asyncio.CancelledError:
            return
        ml = self.get(req.session.session_id, group_id=req.session.group_id)
        text = _chat_visible_text(req.message)
        task: asyncio.Task | None = None
        async with ml.lock:
            if ml.warm_token != token or ml.phase == "thinking":
                return
            judged = await self._judge(req, ml)
            state = self._ensure_heat(ml, req)
            if judged == "leave":
                mark_leave(state)
                self._save_group_heat(req, state)
                return
            if judged != "reply":
                mark_silent(state, time.time())
                self._save_group_heat(req, state)
                return
            self._mark_heat_spoken(req, ml)
            turn = ml.bump()
            abort_event = asyncio.Event()
            ml.abort_event = abort_event
            ml.phase = "thinking"
            task = asyncio.create_task(
                self._generate(req, ml, text, turn, abort_event, reason="heat_warm")
            )
            ml.in_flight_task = task
        if task is None:
            return
        try:
            data = await task
        except asyncio.CancelledError:
            return
        finally:
            async with ml.lock:
                if ml.in_flight_task is task:
                    ml.in_flight_task = None
                    ml.abort_event = None
                    if ml.phase == "thinking":
                        ml.phase = "idle" if not ml.running_jobs() else "tool_running"
        if data.action != "reply" or not data.replies:
            return
        async with ml.lock:
            ml.push_outbox(data.turn_gen, list(data.replies), reason="heat_warm")

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
        ml = self.get(req.session.session_id, group_id=req.session.group_id)
        self._archive_user(req)
        text = _chat_visible_text(req.message)
        active = self._is_active_initiate(req)
        # 纯表情/纯图不再一刀切 skip；是否开口交给热度 / decide
        to_await: asyncio.Task | None = None
        task: asyncio.Task | None = None
        turn = ml.turn_gen

        # 主人记忆指令（同步写 store，不经 LLM）
        mem_cmd = self._try_memory_command(req, text)
        if mem_cmd is not None:
            return mem_cmd

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

            action, reason = await self._choose_action(req, ml, text)
            if action == "reply" and self.settings.chat_heat_enabled:
                self._cancel_warm(ml)
                self._mark_heat_spoken(req, ml)

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
            text = (
                f"{job.get('requester') or '你'}，画好了！"
                if result.get("ok")
                else "画画失败了，待会再试~"
            )
            if pending:
                p = pending[0]
                text += f" {p.get('user')}还在的话也可以说一声"
            replies = [
                ReplyBubble(
                    type="text",
                    text=text,
                    mention=str(job.get("requester_id") or "") or None,
                )
            ]

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
            "要求：尽量用 1 条短句收尾（画好了/失败 + 如有等待的人顺带招呼），不要连发。"
            "输出 JSON {\"replies\":[{\"type\":\"text\",\"text\":\"...\",\"mention\":\"可选user_id\"}]}，默认 1 条，最多 2 条。"
        )
        if not self.settings.llm_configured:
            if result.get("ok"):
                text = f"{job.get('requester')}，终于画好啦，给你~"
            else:
                text = "画画失败了…"
            if pending:
                p = pending[0]
                text += f" {p.get('user')}还在的话也可以说一声"
            return [
                ReplyBubble(
                    type="text",
                    text=text,
                    mention=str(job.get("requester_id") or "") or None,
                )
            ]

        raw = await self._llm_complete(
            [{"role": "user", "content": prompt}],
            self.settings,
            abort_event=None,
        )
        bubbles = parse_replies_json(raw, max_replies=max(1, min(2, self.settings.max_replies + 1)))
        return [ReplyBubble.model_validate(b) for b in bubbles] or [
            ReplyBubble(type="text", text="画好啦~"),
        ]

    def _try_memory_command(self, req: ChatRequest, text: str) -> ChatData | None:
        if not self.settings.chat_memory_enabled:
            return None
        # 需主动发起（@/唤醒）才执行，避免闲聊误触
        if not self._is_active_initiate(req):
            return None
        m = _REMEMBER_RE.match((text or "").strip())
        if m:
            store = get_memory_store()
            msg = store.remember_manual(
                req.session.group_id or _group_id_from_session(req.session.session_id),
                _sender_id(req.message),
                m.group(1).strip(),
            )
            return ChatData(
                action="reply",
                reason="memory_remember",
                turn_gen=self.get(req.session.session_id).turn_gen,
                replies=[ReplyBubble(type="text", text=f"嗯，{msg}")],
            )
        m = _FORGET_RE.match((text or "").strip())
        if m:
            store = get_memory_store()
            msg = store.forget_manual(
                req.session.group_id or _group_id_from_session(req.session.session_id),
                m.group(1).strip(),
            )
            return ChatData(
                action="reply",
                reason="memory_forget",
                turn_gen=self.get(req.session.session_id).turn_gen,
                replies=[ReplyBubble(type="text", text=msg)],
            )
        return None

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
            shelf_items = build_sticker_shelf(
                self._sticker_index(),
                self.settings,
                text=text,
                message=req.message,
                recent=list(req.recent or []),
            )
            messages = await self._build_messages(req, ml, text, shelf_items=shelf_items)
            use_vision = any(
                isinstance(m.get("content"), list)
                and any(
                    isinstance(p, dict) and p.get("type") == "image_url"
                    for p in (m.get("content") or [])
                )
                for m in messages
                if isinstance(m, dict)
            )
            call_settings = self.settings.profile("vision" if use_vision else "text")
            raw = await self._llm_complete(messages, call_settings, abort_event=abort_event)
            if abort_event.is_set():
                return ChatData(action="skip", reason="aborted", turn_gen=turn, aborted=True)
            bubbles = parse_replies_json(raw, max_replies=self.settings.max_replies)
            replies = resolve_sticker_bubbles(
                bubbles,
                self._sticker_index(),
                self.settings,
                shelf_items=shelf_items,
            )
            if not replies:
                replies = [ReplyBubble(type="text", text="嗯？再说一次呗~")]
            for bubble in replies:
                if bubble.type == "text":
                    cleaned, mention = sanitize_outgoing(bubble.text, bubble.mention)
                    bubble.text = cleaned
                    bubble.mention = mention
            ml.append_timeline(
                {"type": "bot", "replies": [r.model_dump() for r in replies], "turn_gen": turn},
                self.settings.timeline_limit,
            )
            ml.note_bot_reply()
            self._persist_and_extract(req, text, replies)
            self._archive_bot(self._group_of(req), replies)
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

    def _persist_and_extract(
        self, req: ChatRequest, text: str, replies: list[ReplyBubble]
    ) -> None:
        if not self.settings.chat_memory_enabled:
            return
        group_id = req.session.group_id or _group_id_from_session(req.session.session_id)
        if not group_id:
            return
        bot_texts = [r.text for r in replies if r.type == "text" and r.text]
        try:
            get_memory_store().append_session(
                group_id,
                user_id=_sender_id(req.message),
                user_text=text,
                bot_replies=bot_texts,
                max_turns=int(self.settings.chat_session_history_turns or 20),
            )
        except Exception as e:
            _logger.warning("session append failed: %s", e)
        schedule_extract_memory(
            self.settings,
            group_id=group_id,
            user_id=_sender_id(req.message),
            user_text=text,
            bot_replies=bot_texts,
        )

    async def _build_messages(
        self,
        req: ChatRequest,
        ml: GroupMainline,
        text: str,
        *,
        shelf_items: list[ShelfItem] | None = None,
    ) -> list[dict[str, Any]]:
        persona = load_persona()
        group_id = req.session.group_id or _group_id_from_session(req.session.session_id)
        mem_extra = ""
        if self.settings.chat_memory_enabled and group_id:
            try:
                inject = await build_memory_context(
                    settings=self.settings,
                    group_id=group_id,
                    user_id=_sender_id(req.message),
                    message_text=text,
                )
                mem_extra = inject.system_extra
            except Exception as e:
                _logger.warning("memory assemble failed: %s", e)

        system = persona
        if mem_extra:
            system = f"{persona}\n\n{mem_extra}"

        disk_lines: list[str] = []
        if group_id:
            try:
                disk_lines = load_transcript_lines(group_id)
            except Exception as err:
                _logger.warning("transcript load failed: %s", err)
        recent_lines: list[str] = []
        for item in (req.recent or [])[-12:]:
            if not isinstance(item, dict):
                continue
            u = ""
            sender = item.get("sender") or {}
            if isinstance(sender, dict):
                u = str(sender.get("card") or sender.get("nickname") or item.get("user_id") or "")
            plain = visible_text(item)
            if not plain:
                plain = str(item.get("raw_message") or _message_text(item) or "")
            if "[CQ:" in plain:
                plain = render_cq_string(plain)
            body = _with_media_placeholders(item, plain)
            if body:
                recent_lines.append(f"{u}: {body}")
        current_line = transcript_line(req.message)
        merged: list[str] = []
        seen: set[str] = set()
        for line in disk_lines + recent_lines:
            key = line.strip()
            if not key or key in seen or (current_line and key == current_line):
                continue
            seen.add(key)
            merged.append(key)
        recent_lines = merged[-30:]

        timeline_lines: list[str] = []
        for ev in ml.timeline[-20:]:
            typ = ev.get("type")
            if typ == "user":
                timeline_lines.append(f"{ev.get('user')}: {ev.get('text')}")
            elif typ == "bot":
                texts = []
                for r in ev.get("replies") or []:
                    if not isinstance(r, dict):
                        continue
                    if r.get("text"):
                        texts.append(str(r["text"]))
                    elif r.get("type") == "image":
                        desc = str(r.get("sticker_desc") or "").strip() or "表情"
                        texts.append(f"[表情包 {desc}]")
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
            + f"【当前消息】{_sender_label(req.message)}: {_with_media_placeholders(req.message, text)}\n"
            + "请按 persona 用 JSON replies 回复：默认只 1 条短句，勿刷屏。"
        )
        if wants_dou_tu(text=text, message=req.message, recent=list(req.recent or [])):
            user_payload += format_shelf_prompt(list(shelf_items or []))
        image_urls = select_vision_urls(
            message=req.message,
            recent=list(req.recent or []),
            settings=self.settings,
            referring=is_referring(text),
        )
        return [
            {"role": "system", "content": system},
            {"role": "user", "content": build_user_content(user_payload, image_urls)},
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
