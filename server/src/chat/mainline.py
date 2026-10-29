from __future__ import annotations

import asyncio
import logging
import random
import re
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from src.chat.jobs import new_job_id, parse_size_spec, run_draw_job
from src.chat.tts import run_tts_job, tts_ready
from src.chat.llm import LLMError, complete, parse_persona_json, parse_replies_json
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
from src.chat.outbound import build_known_users, sanitize_outgoing
from src.chat.group_scope import group_scope_note, is_xingyuan_group
from src.chat.help_capabilities import capability_block
from src.chat.persona import load_persona, load_plain_persona, load_xingyuan_persona
from src.chat.schema import BusyInfo, BusyTool, ChatData, ChatRequest, ReplyBubble
from src.chat.should_respond import decide, is_game_command
from src.chat.trace import append_trace, shrink
from src.chat.temperature import (
    HeatState,
    apply_engagement,
    dwell_expired,
    enter_dwelling,
    exit_dwelling,
    glance_due,
    is_dwelling,
    is_hard_trigger,
    load_heat,
    mark_leave,
    note_human,
    on_glance_silent,
    on_hard_trigger,
    on_speak_success,
    on_thread_hit,
    parse_judge,
    save_heat,
    schedule_next_glance,
    should_cold_skip,
    thread_addresses_bot,
    speak_gap_wait,
)
from src.chat.transcript import (
    append_transcript,
    format_now,
    load_transcript_lines,
    load_transcript_since_bot,
    render_cq_string,
    transcript_line,
    unstamp_line,
    visible_text,
)
from src.core.settings import Settings, get_settings

_logger = logging.getLogger("yoyo.chat.mainline")

_REMEMBER_RE = re.compile(r"^(?:记住|记得)[:：]\s*(.+)$", re.S)
_FORGET_RE = re.compile(r"^(?:忘记|忘掉)[:：]\s*(.+)$", re.S)
_DOU_TU_RE = re.compile(r"斗图|来张|接一个|表情包|发个.*表情")
_HARD_SPEAK_REASONS = frozenset({"at_bot", "wake_word", "reply_to_bot", "bot_name"})

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
    """只看当前这一句。recent 里的旧表情不再打开货架，避免每句都跟一张。"""
    del recent
    if _DOU_TU_RE.search(text or ""):
        return True
    return any(r.kind == "sticker" for r in parse_message_segments(message or {}))


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
    rng=None,
) -> list[ShelfItem]:
    """按需注入货架（对齐工具面）：斗图必开；平时按 chance 掷骰。

    无货架时调用方不拼【可发表情】，模型写不出可用 sticker id。
    """
    if not getattr(settings, "chat_sticker_reply_enabled", True):
        return []
    if not getattr(settings, "chat_sticker_shelf_enabled", True):
        return []
    if store is None:
        return []
    if not wants_dou_tu(text=text, message=message, recent=recent):
        try:
            chance = float(getattr(settings, "chat_sticker_shelf_chance", 0.25) or 0.0)
        except (TypeError, ValueError):
            chance = 0.25
        if chance <= 0:
            return []
        roll = float((rng or random.random)())
        if chance < 1 and roll >= chance:
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
        return "\n【可发表情】货架为空：不要输出 sticker。"
    lines = ["\n【可发表情】"]
    for it in items:
        emo = "/".join(it.emotions) if it.emotions else ""
        extra = f"｜{emo}" if emo else ""
        lines.append(f"- {it.id} {it.caption}{extra}")
    lines.append(
        "以上是本轮可选表情包。"
        '要用就写 {"type":"sticker","id":"s1"}，id 必须是上面的；'
        "不用就只回文字，别写 sticker，也别说已经发了图。"
    )
    return "\n".join(lines)


def resolve_sticker_bubbles(
    raw_bubbles,
    store,
    settings,
    *,
    shelf_items: list[ShelfItem] | None = None,
) -> list[ReplyBubble]:
    """选出站气泡。模型写了文字就留文字，选了表情就发图，两边都在就都发。"""
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


def _recent_speakers(ml: "GroupMainline", req: ChatRequest) -> list[str]:
    out: list[str] = []
    for ev in list(ml.timeline or [])[-10:]:
        if not isinstance(ev, dict) or ev.get("type") != "user":
            continue
        uid = str(ev.get("user_id") or "").strip()
        if uid:
            out.append(uid)
    for item in list(req.recent or [])[-8:]:
        if not isinstance(item, dict):
            continue
        uid = str(item.get("user_id") or "").strip()
        if uid:
            out.append(uid)
    return out[-8:]


def _pointed_elsewhere(req: ChatRequest, bot_names: list[str] | None = None) -> bool:
    """@ 了别人且话里完全没提悠悠 → 才算指向他人。

    @别人但在说机器人/群话题（「@塔菲 悠悠刚说的…」）不当封闭私聊。
    """
    if req.hints.at_bot or req.hints.reply_to_bot:
        return False
    msg = req.message if isinstance(req.message, dict) else {}
    blob = " ".join(
        [
            _chat_visible_text(msg),
            str(msg.get("raw_message") or ""),
            effective_text(msg) or "",
        ]
    )
    names = [n for n in (bot_names or []) if n]
    if any(n and n in blob for n in names) or "悠悠" in blob:
        return False
    for seg in msg.get("message") or []:
        if not isinstance(seg, dict):
            continue
        if str(seg.get("type") or "") != "at":
            continue
        data = seg.get("data") if isinstance(seg.get("data"), dict) else {}
        qq = str(seg.get("qq") or data.get("qq") or "").strip()
        if qq and qq.lower() not in {"all", "0"}:
            return True
    return False


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
class SpeakItem:
    req: ChatRequest
    text: str
    reason: str


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
    speak_token: int = 0
    speak_task: asyncio.Task | None = None
    speak_buffer: list[SpeakItem] = field(default_factory=list)
    glance_token: int = 0
    glance_task: asyncio.Task | None = None
    # 兼容旧名
    engage_token: int = 0
    engage_task: asyncio.Task | None = None
    # 工具已完成、收尾 LLM / 入队 outbox 尚未结束 —— 轮询必须继续
    awaiting_outbox: bool = False
    # 最近一次成功 look 的本地立绘（供 draw.use_ref；不含用户上传图）
    pending_look_ref: dict[str, Any] | None = None

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
        tools = [
            BusyTool(id=str(j["id"]), name=str(j["name"]), status=str(j.get("status") or "running"))
            for j in jobs
        ]
        if self.awaiting_outbox:
            tools.append(BusyTool(id="deliver", name="收尾发送", status="running"))
        if not tools:
            return None
        return BusyInfo(tools=tools)

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
        # 多气泡各自一行，和群里延时分开发一致；禁止拼成「A / B」
        lines: list[str] = []
        for r in replies:
            if r.type == "text" and r.text and r.text.strip():
                lines.append(f"悠悠: {r.text.strip()}")
            elif r.type == "image":
                desc = (r.sticker_desc or "").strip() or "表情"
                lines.append(f"悠悠: [表情包 {desc}]")
        if not lines:
            return
        try:
            for line in lines:
                append_transcript(group_id, line)
        except Exception as err:
            _logger.warning("transcript bot append failed: %s", err)

    def _ensure_heat(self, ml: GroupMainline, req: ChatRequest) -> HeatState:
        if ml.heat is None:
            gid = self._group_of(req)
            ml.heat = load_heat(gid) if gid else HeatState()
        state = ml.heat
        if not str(state.partner_id or "").strip() and state.focus_user_ids:
            state.partner_id = str(state.focus_user_ids[0])
        if state.mode == "engaged" and not str(state.partner_id or "").strip():
            state.mode = "idle"
            state.engaged_until = 0.0
            state.backoff_until = 0.0
            state.silent_streak = 0
        return state

    def _write_trace(self, req: ChatRequest, event: dict) -> None:
        """临时调试日志。删除清单：docs/11-debug-trace-remove.md"""
        gid = self._group_of(req)
        if not gid:
            return
        try:
            row = {"request_id": req.request_id, **event}
            append_trace(gid, row)
            _logger.info(
                "trace group=%s event=%s reason=%s action=%s",
                gid,
                event.get("event"),
                event.get("reason") or "",
                event.get("action") or "",
            )
        except Exception as err:
            _logger.warning("trace failed: %s", err)

    def _save_group_heat(self, req: ChatRequest, state: HeatState) -> None:
        gid = self._group_of(req)
        if not gid:
            return
        try:
            save_heat(gid, state)
        except Exception as err:
            _logger.warning("heat save failed: %s", err)

    def _glance_bounds(self) -> dict[str, Any]:
        return {
            "idle": tuple(self.settings.chat_glance_idle_sec),
            "chat": tuple(self.settings.chat_glance_chat_sec),
            "focus": tuple(self.settings.chat_glance_focus_sec),
            "retry": tuple(self.settings.chat_backoff_retry_sec),
            "attention_factor": float(self.settings.chat_backoff_attention_factor),
            "decay_per_min": float(self.settings.chat_attention_decay_per_min),
        }

    def _dwell_bounds(self) -> dict[str, Any]:
        return {
            "hot": tuple(self.settings.chat_dwell_hot_sec),
            "chat": tuple(self.settings.chat_dwell_chat_sec),
            "idle": tuple(self.settings.chat_dwell_idle_sec),
        }

    def _mark_heat_spoken(self, req: ChatRequest, ml: GroupMainline) -> None:
        """硬触发开口前：写 partner（P0 只写不读）。"""
        state = self._ensure_heat(ml, req)
        uid = _sender_id(req.message)
        if uid:
            state.partner_id = uid
        self._save_group_heat(req, state)

    def _reschedule_glance(self, state: HeatState, now: float) -> float:
        return schedule_next_glance(state, now, **self._glance_bounds())

    def _exit_dwell_and_schedule(self, state: HeatState, now: float) -> float:
        return exit_dwelling(state, now, **self._glance_bounds())

    def _enter_dwell(self, state: HeatState, now: float) -> float:
        return enter_dwelling(state, now, **self._dwell_bounds())

    def _busy(self, ml: GroupMainline) -> bool:
        return ml.phase in {"thinking", "tool_running"} or ml.awaiting_outbox

    def _arm_glance_timer(self, ml: GroupMainline, group_id: str) -> None:
        """away：进场节拍；dwelling：到期退出。"""
        if not self.settings.chat_heat_enabled or not group_id:
            return
        state = ml.heat
        if state is None:
            return
        now = time.time()
        if is_dwelling(state):
            delay = float(state.dwell_until or 0) - now
        else:
            delay = float(state.next_glance_at or 0) - now
        ml.glance_token += 1
        token = ml.glance_token
        old = ml.glance_task
        if old is not None and not old.done():
            old.cancel()
        ml.glance_task = asyncio.create_task(
            self._glance_timer(ml.session_id, group_id, token, max(0.05, delay))
        )

    async def _glance_timer(self, session_id: str, group_id: str, token: int, delay: float) -> None:
        try:
            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            return
        ml = self.get(session_id)
        if ml.glance_token != token:
            return
        if not self.settings.chat_heat_enabled:
            return
        now = time.time()
        async with ml.lock:
            if ml.glance_token != token:
                return
            state = ml.heat if ml.heat is not None else load_heat(group_id)
            ml.heat = state
            if is_dwelling(state):
                if not dwell_expired(state, now):
                    self._arm_glance_timer(ml, group_id)
                    return
                if self._busy(ml):
                    # busy：延迟退出
                    ml.glance_task = asyncio.create_task(
                        self._glance_timer(session_id, group_id, token, 2.0)
                    )
                    return
                self._exit_dwell_and_schedule(state, now)
                try:
                    save_heat(group_id, state)
                except Exception as err:
                    _logger.warning("dwell exit save failed: %s", err)
                self._arm_glance_timer(ml, group_id)
                return
            # away
            if self._busy(ml):
                ml.glance_task = asyncio.create_task(
                    self._glance_timer(session_id, group_id, token, 2.0)
                )
                return
            if not glance_due(state, now):
                self._arm_glance_timer(ml, group_id)
                return
            if should_cold_skip(state, now):
                self._reschedule_glance(state, now)
                try:
                    save_heat(group_id, state)
                except Exception as err:
                    _logger.warning("glance cold_skip save failed: %s", err)
                self._arm_glance_timer(ml, group_id)
                return
            # 进场但不调模型；等消息走快判，或空等至 dwell_until 退出
            self._enter_dwell(state, now)
            try:
                save_heat(group_id, state)
            except Exception as err:
                _logger.warning("dwell enter save failed: %s", err)
            self._arm_glance_timer(ml, group_id)

    def _maybe_exit_dwell(self, ml: GroupMainline, state: HeatState, now: float) -> bool:
        """到期且非 busy → 退出。返回是否刚退出。"""
        if not dwell_expired(state, now):
            return False
        if self._busy(ml):
            return False
        self._exit_dwell_and_schedule(state, now)
        return True

    def _apply_heat_engagement(
        self,
        req: ChatRequest,
        ml: GroupMainline,
        engagement: object,
        *,
        reason: str = "",
        spoke: bool = True,
    ) -> None:
        if not self.settings.chat_heat_enabled:
            return
        now = time.time()
        state = self._ensure_heat(ml, req)
        if str(engagement or "").strip().lower() == "leave":
            mark_leave(state)
            self._reschedule_glance(state, now)
            self._save_group_heat(req, state)
            self._arm_glance_timer(ml, self._group_of(req))
            return
        apply_engagement(
            state,
            engagement,
            now,
            user_id=_sender_id(req.message),
        )
        if spoke:
            on_speak_success(
                state,
                now,
                unanswered_give_up=float(self.settings.chat_unanswered_give_up_sec),
                hot=tuple(self.settings.chat_dwell_hot_sec),
                chat_dwell=tuple(self.settings.chat_dwell_chat_sec),
                idle_dwell=tuple(self.settings.chat_dwell_idle_sec),
            )
        else:
            on_glance_silent(state, now, thread_hit=False)
        # 开口后必在 dwelling，不排 next_glance；仅 leave/空手退出才排
        if not is_dwelling(state):
            self._reschedule_glance(state, now)
        del reason
        self._save_group_heat(req, state)
        self._arm_glance_timer(ml, self._group_of(req))

    def _cancel_speak(self, ml: GroupMainline) -> None:
        ml.speak_token += 1
        ml.engage_token = ml.speak_token
        task = ml.speak_task or ml.engage_task
        ml.speak_task = None
        ml.engage_task = None
        if task is not None and not task.done():
            task.cancel()

    def _cancel_engage(self, ml: GroupMainline) -> None:
        self._cancel_speak(ml)

    async def _abort_thinking(self, ml: GroupMainline) -> None:
        """终止进行中的人设推理（不取消工具 job）。"""
        if not self.settings.interrupt_enabled:
            return
        if ml.phase != "thinking" or ml.abort_event is None:
            return
        ml.abort_event.set()
        task = ml.in_flight_task
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        ml.phase = "idle" if not ml.running_jobs() else "tool_running"
        ml.abort_event = None
        ml.in_flight_task = None
        _logger.info("interrupted thinking session=%s", ml.session_id)

    def _schedule_speak(self, req: ChatRequest, ml: GroupMainline, text: str, reason: str) -> None:
        """开口统一走防抖攒句：思考中则先打断，安静几秒后一轮人设。"""
        ml.speak_buffer.append(SpeakItem(req=req, text=text, reason=reason))
        ml.speak_token += 1
        ml.engage_token = ml.speak_token
        token = ml.speak_token
        old = ml.speak_task or ml.engage_task
        if old is not None and not old.done():
            old.cancel()
        task = asyncio.create_task(self._speak_later(token, ml.session_id))
        ml.speak_task = task
        ml.engage_task = task

    def _schedule_engage(self, req: ChatRequest, ml: GroupMainline) -> None:
        self._schedule_speak(req, ml, _chat_visible_text(req.message), "engaged_partner")

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
            )
        names = self.settings.bot_name_list
        hard = is_hard_trigger(
            text,
            at_bot=req.hints.at_bot,
            wake=req.hints.wake_word,
            reply_to=req.hints.reply_to_bot,
            names=names,
        )
        if not hard and not self.settings.proactive_enabled:
            return "skip", "no_trigger"

        now = time.time()
        state = self._ensure_heat(ml, req)
        uid = _sender_id(req.message)
        # 到期 dwell 先退出（busy 则延后）；再记人类发言
        if self._maybe_exit_dwell(ml, state, now):
            self._arm_glance_timer(ml, self._group_of(req))
        note_human(state, now)  # 消息路径不做 cold_skip
        heat_before = asdict(state)
        kind = "glance"

        def finish(action: str, reason: str, **extra: object) -> tuple[str, str]:
            self._write_trace(
                req,
                {
                    "event": "decide",
                    "speaker": _sender_label(req.message),
                    "user_id": uid,
                    "text": (text or "")[:500],
                    "hard": hard,
                    "kind": kind,
                    "action": action,
                    "reason": reason,
                    "heat_before": heat_before,
                    "heat_after": asdict(state),
                    **extra,
                },
            )
            return action, reason

        # 硬触发：立即进/延 dwelling，直接排队开口。间隔看上次决定，不在 @ 上另加愣住。
        if hard:
            on_hard_trigger(
                state,
                now,
                user_id=uid,
                at_reaction=tuple(self.settings.chat_at_reaction_sec),
                hot=tuple(self.settings.chat_dwell_hot_sec),
                chat_dwell=tuple(self.settings.chat_dwell_chat_sec),
                idle_dwell=tuple(self.settings.chat_dwell_idle_sec),
            )
            self._save_group_heat(req, state)
            self._arm_glance_timer(ml, self._group_of(req))
            kind = "hard"
            if req.hints.at_bot:
                return finish("reply", "at_bot")
            if req.hints.wake_word:
                return finish("reply", "wake_word")
            if req.hints.reply_to_bot:
                return finish("reply", "reply_to_bot")
            return finish("reply", "bot_name")

        hit = thread_addresses_bot(
            at_bot=req.hints.at_bot,
            reply_to_bot=req.hints.reply_to_bot,
            quotes_bot=False,
        )
        if hit:
            on_thread_hit(state, now)

        # away 且未排期 → 先排进场节拍
        if not is_dwelling(state) and float(state.next_glance_at or 0) <= 0:
            kind = "glance_init"
            self._reschedule_glance(state, now)
            self._save_group_heat(req, state)
            self._arm_glance_timer(ml, self._group_of(req))
            return finish("skip", "glance_wait")

        # away 未到进场点
        if not is_dwelling(state) and not glance_due(state, now):
            kind = "glance_wait"
            self._save_group_heat(req, state)
            return finish("skip", "glance_wait")

        # away 到期 → 进 dwelling（消息路径必有人说话，不做 cold_skip）
        if not is_dwelling(state):
            self._enter_dwell(state, now)
            kind = "dwell_enter"

        kind = "dwell_judge" if kind != "dwell_enter" else "dwell_enter"
        judged = await self._judge(req, ml)
        if judged == "reply":
            # 快判要开口就进人设；节奏交给 glance 间隔、防抖，以及两次决定之间的开口底线
            self._save_group_heat(req, state)
            self._arm_glance_timer(ml, self._group_of(req))
            return finish("reply", "heat_reply", judge=judged)
        if judged == "leave":
            mark_leave(state)
            self._reschedule_glance(state, now)
            self._save_group_heat(req, state)
            self._arm_glance_timer(ml, self._group_of(req))
            return finish("skip", "heat_leave", judge=judged, heat_after=asdict(state))
        on_glance_silent(state, now, thread_hit=hit)
        # dwell 内 silent 不排 next_glance
        self._save_group_heat(req, state)
        self._arm_glance_timer(ml, self._group_of(req))
        return finish("skip", "heat_silent", judge=judged, heat_after=asdict(state))

    async def _judge(self, req: ChatRequest, ml: GroupMainline) -> str:
        if not self.settings.llm_configured:
            return "silent"
        gid = self._group_of(req)
        # 快判也要看见离场期间攒下的话，避免只盯最后几句
        lines = load_transcript_since_bot(gid, max_lines=60, max_chars=3500) if gid else []
        blob = "\n".join(lines[-40:]) or "（无）"
        prompt = (
            "【要不要接话】这是「看一眼群」：看整段近况，不是必须回最后一条，也不是句句都接。\n"
            "不要写回复正文。只输出 JSON："
            "{\"action\":\"reply\"} 或 {\"action\":\"silent\"} 或 {\"action\":\"leave\"}。\n"
            "默认偏旁听。群很热闹、别人聊得好好的、没有点名你时 → silent。\n"
            "reply：有人@/点名悠悠；话是说给你的（追问、要你补充、在等你答）；"
            "刚被点名的提问还没答上（别被中间表情/路人图带偏）；"
            "或插一句会明显加分的开放求助/好玩话题。\n"
            "silent：纯刷表情/图；别人互聊与你无关；围观吐槽机器人/模型；"
            "已经接过一轮还在空吵「是不是机器人」——别跟着吵。\n"
            "克制（不是禁言）：若悠悠刚说过话，先想「这轮还轮到我吗」——"
            "有人在等你续答/追问你/需要你补一句 → reply；"
            "话题已落地、只是闲扯或别人接话了 → silent。克制=少抢话，不是有问也不回。\n"
            "leave：明确赶走或不想再听。拿不准 → silent。\n"
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
            self._write_trace(req, {"event": "judge", "prompt": prompt, "error": str(err)[:300], "action": "silent"})
            return "silent"
        action = parse_judge(raw)
        self._write_trace(req, {"event": "judge", "prompt": prompt, "raw": raw, "action": action})
        return action

    async def _speak_later(self, token: int, session_id: str) -> None:
        """防抖到期 → 若距上次决定开口太近则等到阈值 → 人设。"""
        try:
            await asyncio.sleep(max(0.05, float(self.settings.chat_heat_debounce_sec or 0)))
        except asyncio.CancelledError:
            return
        ml = self.get(session_id)
        task: asyncio.Task | None = None
        req: ChatRequest | None = None
        text = ""
        reason = "hold"
        wait = 0.0
        async with ml.lock:
            if ml.speak_token != token:
                return
            if not ml.speak_buffer:
                return
            # 两次决定开口不能短于 chatSpeakMinGapSec 下限；不够就等，不丢句。
            if self.settings.chat_heat_enabled:
                primary0 = ml.speak_buffer[-1]
                st = ml.heat
                if st is None:
                    gid0 = primary0.req.session.group_id or _group_id_from_session(session_id)
                    if gid0:
                        st = load_heat(str(gid0))
                        ml.heat = st
                if st is not None:
                    wait = speak_gap_wait(
                        st,
                        time.time(),
                        speak_gap=tuple(self.settings.chat_speak_min_gap_sec),
                    )
        if wait > 0:
            try:
                await asyncio.sleep(wait)
            except asyncio.CancelledError:
                return
        async with ml.lock:
            if ml.speak_token != token:
                return
            if not ml.speak_buffer:
                return
            items = list(ml.speak_buffer)
            ml.speak_buffer.clear()
            # 硬触发优先作 primary，避免路人图/表情盖掉 @ 问题
            primary = next(
                (it for it in reversed(items) if (it.reason or "") in _HARD_SPEAK_REASONS),
                items[-1],
            )
            req = primary.req
            reason = primary.reason or "hold"
            chunks = [it.text.strip() for it in items if (it.text or "").strip()]
            text = "\n".join(chunks) if chunks else (primary.text or "")
            # 这轮算一次「决定开口」。下一次决定至少再隔阈值。
            if ml.heat is not None:
                ml.heat.last_decide_at = time.time()
                ml.heat.earliest_speak_at = 0.0
                self._save_group_heat(req, ml.heat)
            turn = ml.bump()
            abort_event = asyncio.Event()
            ml.abort_event = abort_event
            ml.phase = "thinking"
            task = asyncio.create_task(
                self._generate(req, ml, text, turn, abort_event, reason=reason)
            )
            ml.in_flight_task = task
        if task is None or req is None:
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
        async with ml.lock:
            if ml.speak_token != token:
                return
        if data.action == "skip" and data.reason in {"empty_reply", "aborted"}:
            return
        async with ml.lock:
            if data.busy and data.busy.tools:
                ml.phase = "tool_running"
        # 静默工具启动（如 TTS）：无气泡也要占住 busy，等 pending 出站
        if data.action != "reply" or not data.replies:
            return
        out_reason = data.reason or reason
        async with ml.lock:
            ml.push_outbox(data.turn_gen, list(data.replies), reason=out_reason)

    async def _engage_later(self, req: ChatRequest, token: int) -> None:
        await self._speak_later(token, req.session.session_id)

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

        # 主人记忆指令（同步写 store，不经 LLM）
        mem_cmd = self._try_memory_command(req, text)
        if mem_cmd is not None:
            return mem_cmd

        async with ml.lock:
            # 工具进行中 + 主动发起 → 记 pending + ack_busy（不取消 job）
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
                return ChatData(
                    action="skip",
                    reason="tool_running_listen",
                    turn_gen=ml.turn_gen,
                    busy=ml.busy_info(),
                )

        action, reason = await self._choose_action(req, ml, text)

        async with ml.lock:
            ml.append_timeline(
                {
                    "type": "user",
                    "user": _sender_label(req.message),
                    "user_id": _sender_id(req.message),
                    "text": text,
                    "active": active,
                    "decision": action,
                    "reason": reason,
                },
                self.settings.timeline_limit,
            )

            speak_now = action == "reply" or reason == "hold"
            if not speak_now:
                stuck = ml.drain_outbox()
                if stuck:
                    replies: list[ReplyBubble] = []
                    out_reason = reason
                    out_turn = ml.turn_gen
                    for it in stuck:
                        replies.extend(it.replies)
                        out_turn = it.turn_gen
                        out_reason = it.reason
                    if self.settings.chat_heat_enabled:
                        self._mark_heat_spoken(req, ml)
                    return ChatData(
                        action="reply",
                        reason=out_reason,
                        turn_gen=out_turn,
                        busy=ml.busy_info(),
                        replies=replies[: self.settings.max_replies * 2],
                    )
                return ChatData(action="skip", reason=reason, turn_gen=ml.turn_gen, busy=ml.busy_info())

            speak_reason = reason if action == "reply" else "engaged_partner"
            if self.settings.chat_heat_enabled and speak_reason != "heat_reply":
                self._mark_heat_spoken(req, ml)

        # 思考中 → 打断后与新句一并防抖；已说完 → 同样防抖攒句
        await self._abort_thinking(ml)
        async with ml.lock:
            self._schedule_speak(req, ml, text, speak_reason)
            return ChatData(
                action="skip",
                reason="hold",
                turn_gen=ml.turn_gen,
                busy=ml.busy_info(),
            )

    def _draw_sources(self, req: ChatRequest) -> list[str]:
        """本条普通图优先；指代时再补 recent。表情包不进编辑参考。"""
        urls = select_vision_urls(
            message=req.message,
            recent=list(req.recent or []),
            settings=self.settings,
            referring=is_referring(_chat_visible_text(req.message)),
        )
        # 即使 vision 关着，画画仍可用本条 photo url
        if urls:
            return urls
        out: list[str] = []
        for ref in parse_message_segments(req.message if isinstance(req.message, dict) else None):
            if ref.kind == "photo" and (ref.path or ref.url):
                out.append(ref.path or ref.url)
        return out[:2]

    async def _start_draw_job(
        self,
        req: ChatRequest,
        ml: GroupMainline,
        text: str,
        *,
        prompt: str | None = None,
        sources: list[str] | None = None,
        size: str | None = None,
        ack_text: str | None = None,
        turn: int | None = None,
    ) -> ChatData:
        """由 agent JSON {"type":"draw"} 触发；有参考图则改图，否则文生图。"""
        refs = sources if sources is not None else self._draw_sources(req)
        is_edit = bool(refs)
        draw_prompt = (prompt or text or "").strip() or (text or "cute illustration")
        job_id = new_job_id()
        job = {
            "id": job_id,
            "name": "改图" if is_edit else "画画",
            "status": "running",
            "prompt": draw_prompt,
            "mode": "edit" if is_edit else "generate",
            "size": size,
            "sources": refs,
            "requester": _sender_label(req.message),
            "requester_id": _sender_id(req.message),
            "started_at": time.time(),
        }
        ml.jobs.append(job)
        ml.phase = "tool_running"
        out_turn = turn if turn is not None else ml.bump()
        ml.append_timeline(
            {
                "type": "tool_started",
                "job_id": job_id,
                "name": job["name"],
                "mode": job["mode"],
                "size": size,
            },
            self.settings.timeline_limit,
        )

        async def _on_done(jid: str, result: dict[str, Any]) -> None:
            await self._on_tool_done(req.session.session_id, jid, result)

        task = asyncio.create_task(
            run_draw_job(
                job_id=job_id,
                prompt=draw_prompt,
                settings=self.settings,
                delay_sec=self.settings.draw_mock_delay_sec,
                on_done=_on_done,
                sources=refs,
                size=size,
            )
        )
        ml.job_tasks[job_id] = task

        default_ack = (
            "好，按你这张改！稍等本公主一会儿~" if is_edit else "好，我画！稍等本公主一会儿~"
        )
        bubble = ReplyBubble(type="text", text=(ack_text or "").strip() or default_ack)
        ml.note_bot_reply()
        self._write_trace(
            req,
            {
                "event": "sent",
                "reason": "tool_started",
                "mode": job["mode"],
                "sources": [str(s)[:120] for s in (refs or [])],
                "replies": [bubble.model_dump()],
            },
        )
        return ChatData(
            action="reply",
            reason="tool_started",
            turn_gen=out_turn,
            busy=ml.busy_info(),
            replies=[bubble],
        )

    async def _start_tts_job(
        self,
        req: ChatRequest,
        ml: GroupMainline,
        *,
        text: str,
        speed: float | None = None,
        style: str | None = None,
        turn: int | None = None,
    ) -> ChatData:
        """由 agent JSON {"type":"tts"} 触发；成功后只发语音条。"""
        spoken = (text or "").strip()
        job_id = new_job_id()
        job = {
            "id": job_id,
            "name": "语音",
            "status": "running",
            "prompt": spoken,
            "mode": "tts",
            "speed": speed,
            "style": style,
            "requester": _sender_label(req.message),
            "requester_id": _sender_id(req.message),
            "started_at": time.time(),
        }
        ml.jobs.append(job)
        ml.phase = "tool_running"
        out_turn = turn if turn is not None else ml.bump()
        ml.append_timeline(
            {
                "type": "tool_started",
                "job_id": job_id,
                "name": job["name"],
                "mode": "tts",
            },
            self.settings.timeline_limit,
        )

        async def _on_done(jid: str, result: dict[str, Any]) -> None:
            await self._on_tool_done(req.session.session_id, jid, result)

        task = asyncio.create_task(
            run_tts_job(
                job_id=job_id,
                text=spoken,
                settings=self.settings,
                speed=speed,
                style=style,
                on_done=_on_done,
            )
        )
        ml.job_tasks[job_id] = task
        self._write_trace(
            req,
            {
                "event": "sent",
                "reason": "tool_started",
                "mode": "tts",
                "text": spoken[:80],
                "replies": [],
            },
        )
        return ChatData(
            action="reply",
            reason="tool_started",
            turn_gen=out_turn,
            busy=ml.busy_info(),
            replies=[],
        )

    async def _on_tool_done(self, session_id: str, job_id: str, result: dict[str, Any]) -> None:
        ml = self.get(session_id)
        async with ml.lock:
            job = next((j for j in ml.jobs if j["id"] == job_id), None)
            if not job:
                return
            # 先占住 busy，避免插件在 narrate 期间误判空闲停轮询
            ml.awaiting_outbox = True
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

        kind = str(result.get("kind") or "").strip().lower()
        if kind == "audio" or str(job.get("mode") or "") == "tts":
            if result.get("ok") and result.get("path"):
                path = _confined_image_path(str(result["path"]))
                replies = (
                    [ReplyBubble(type="record", path=path)]
                    if path
                    else [ReplyBubble(type="text", text="这句没发出去")]
                )
            else:
                replies = [ReplyBubble(type="text", text="这句没发出去")]
        else:
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
                        mention=None,
                    )
                ]

            if result.get("ok") and result.get("path"):
                img = _confined_image_path(str(result["path"]))
                if img:
                    replies.insert(
                        1 if replies else 0,
                        ReplyBubble(type="image", path=img),
                    )
            elif result.get("ok") and result.get("caption"):
                if not any(r.type == "image" for r in replies):
                    replies.insert(
                        min(1, len(replies)),
                        ReplyBubble(type="text", text=str(result["caption"])),
                    )

        async with ml.lock:
            try:
                ml.push_outbox(turn, replies[: self.settings.max_replies * 2], reason="tool_done")
                ml.phase = "idle" if not ml.running_jobs() else "tool_running"
                ml.append_timeline(
                    {"type": "bot", "replies": [r.model_dump() for r in replies], "turn_gen": turn},
                    self.settings.timeline_limit,
                )
                # 画完收尾：抬 attention；dwell 内不排进场，away 才排
                if self.settings.chat_heat_enabled:
                    try:
                        gid = _group_id_from_session(session_id)
                        state = ml.heat if ml.heat is not None else (load_heat(gid) if gid else HeatState())
                        ml.heat = state
                        now = time.time()
                        uid = str(job.get("requester_id") or "").strip()
                        if uid:
                            state.partner_id = uid  # P0 只写不读
                        on_speak_success(
                            state,
                            now,
                            unanswered_give_up=float(self.settings.chat_unanswered_give_up_sec),
                        )
                        if not is_dwelling(state):
                            self._reschedule_glance(state, now)
                        if gid:
                            save_heat(gid, state)
                            self._arm_glance_timer(ml, gid)
                    except Exception as err:
                        _logger.warning("tool_done heat schedule failed: %s", err)
            finally:
                ml.awaiting_outbox = False

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
            "默认不要 @、不要填 mention，直接喊昵称即可。"
            "输出 JSON {\"engagement\":\"hold\",\"replies\":[{\"type\":\"text\",\"text\":\"...\"}]}，默认 1 条，最多 2 条。"
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
                    mention=None,
                )
            ]

        raw = await self._llm_complete(
            [{"role": "user", "content": prompt}],
            self.settings,
            abort_event=None,
        )
        bubbles = parse_replies_json(raw, max_replies=max(1, min(2, self.settings.max_replies + 1)))
        # 工具收尾只要文字；丢掉 sticker/draw 等非法 type，避免 ReplyBubble 校验炸掉
        texts: list[ReplyBubble] = []
        for b in bubbles:
            if not isinstance(b, dict):
                continue
            t = str(b.get("text") or "").strip()
            if not t:
                continue
            texts.append(
                ReplyBubble(
                    type="text",
                    text=t,
                    mention=str(b.get("mention") or "") or None,
                )
            )
        out = texts or [ReplyBubble(type="text", text="画好啦~")]
        # 工具收尾没有完整 ChatRequest，用 pending/requester 拼已知用户
        known = build_known_users(
            focus_user_ids=[str(job.get("requester_id") or "")] if job.get("requester_id") else None,
            extra={
                str(p.get("user") or ""): str(p.get("user_id") or "")
                for p in pending
                if p.get("user_id")
            },
        )
        if job.get("requester") and job.get("requester_id"):
            known[str(job["requester"])] = str(job["requester_id"])
        self._scrub_mentions(None, out, known=known)
        return out

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


    def _lookup_limit(self) -> int:
        try:
            lookup_max = int(getattr(self.settings, "chat_game_lookup_max", 2))
        except (TypeError, ValueError):
            lookup_max = 2
        return max(0, lookup_max)

    def _look_limit(self) -> int:
        try:
            look_max = int(getattr(self.settings, "chat_hero_look_max_per_turn", 1))
        except (TypeError, ValueError):
            look_max = 1
        return max(0, look_max)

    def _web_result_limit(self) -> int:
        try:
            n = int(getattr(self.settings, "chat_web_search_max_results", 10))
        except (TypeError, ValueError):
            n = 10
        return min(50, max(1, n))

    async def _follow_declared_tools(
        self,
        req: ChatRequest,
        ml: GroupMainline,
        text: str,
        bubbles: list,
        engagement: str,
        *,
        shelf_items: list[ShelfItem] | None,
        call_settings,
        abort_event: asyncio.Event,
        reason: str,
        allow_game: bool = True,
        allow_web: bool = True,
    ) -> tuple[list, str]:
        """声明了图鉴或联网工具时同步执行，再带【工具结果】问一次人设。"""
        parts: list[str] = []
        xingyuan = is_xingyuan_group(req.session.group_name)
        if allow_game and xingyuan and getattr(self.settings, "chat_game_kb_enabled", True):
            lookup_max = self._lookup_limit()
            game_ops = [
                b
                for b in bubbles
                if isinstance(b, dict) and b.get("type") in {"lookup", "expand"}
            ][:lookup_max]
            if game_ops and lookup_max > 0:
                from src.chat.game_kb import run_lookups

                tool_blob = run_lookups(game_ops, max_ops=lookup_max)
                parts.append(tool_blob)
                self._write_trace(
                    req,
                    {
                        "event": "game_lookup",
                        "ops": game_ops,
                        "result": (tool_blob or "")[:500],
                    },
                )
        if xingyuan and getattr(self.settings, "chat_hero_look_enabled", True):
            look_max = self._look_limit()
            look_ops = [
                b for b in bubbles if isinstance(b, dict) and b.get("type") == "look"
            ][:look_max]
            if look_ops and look_max > 0:
                from pathlib import Path

                from src.chat.hero_look import format_look_blob, run_looks
                from src.chat.hero_look.describe import describe_first_clear, weak_desc
                from src.chat.hero_look.index import hero_img_candidates
                from src.chat.hero_look.run import stage_look_file

                def _sync_describe(path, hero_id, name):
                    return weak_desc(hero_id, name)

                look_blob, pending_ref, results = await asyncio.to_thread(
                    run_looks,
                    look_ops,
                    self_hero_id=str(
                        getattr(self.settings, "chat_game_self_hero_id", "101003") or "101003"
                    ),
                    session_id=req.session.session_id,
                    max_ops=look_max,
                    describe=_sync_describe,
                )
                if (
                    pending_ref
                    and pending_ref.get("path")
                    and results
                    and results[-1].get("ok")
                ):
                    hero_id = str(pending_ref.get("hero_id") or "")
                    name = str(pending_ref.get("name") or "")
                    candidates = [Path(p) for p in hero_img_candidates(hero_id, limit=3)]
                    if not candidates:
                        candidates = [Path(str(pending_ref["path"]))]
                    better, src = await describe_first_clear(
                        self.settings,
                        candidates,
                        hero_id=hero_id,
                        name=name,
                    )
                    chosen = src or (candidates[0] if candidates else None)
                    if chosen is not None:
                        staged = stage_look_file(
                            chosen,
                            session_id=req.session.session_id,
                            hero_id=hero_id,
                        )
                        pending_ref["path"] = str(staged)
                    if better:
                        results[-1]["desc"] = better[:200]
                        look_blob = format_look_blob(results)
                if look_blob:
                    parts.append(look_blob)
                    self._write_trace(
                        req,
                        {
                            "event": "hero_look",
                            "ops": look_ops,
                            "result": (look_blob or "")[:500],
                        },
                    )
                if pending_ref:
                    ml.pending_look_ref = pending_ref
        if allow_web and getattr(self.settings, "chat_web_search_enabled", True):
            web_ops = [
                b
                for b in bubbles
                if isinstance(b, dict) and b.get("type") in {"web_search", "web_fetch"}
            ][:2]
            if web_ops:
                from src.chat.web_search import run_web_ops

                try:
                    web_blob = await asyncio.to_thread(
                        run_web_ops,
                        web_ops,
                        max_results=self._web_result_limit(),
                    )
                except Exception as exc:
                    _logger.warning("web search failed: %s", exc)
                    web_blob = (
                        "【工具结果】\n"
                        '{"tool":"web_search","ok":false,"results":[],'
                        '"hint":"搜索失败，不要编造 URL，直接说明没搜到。"}'
                    )
                parts.append(web_blob)
                self._write_trace(
                    req,
                    {
                        "event": "web_search",
                        "ops": web_ops,
                        "result": (web_blob or "")[:500],
                    },
                )
        tool_blob = "\n".join(p for p in parts if p)
        if not tool_blob:
            return bubbles, engagement
        if abort_event.is_set():
            return bubbles, engagement
        messages = await self._build_messages(req, ml, text, shelf_items=shelf_items)
        messages.append(
            {
                "role": "user",
                "content": (
                    f"{tool_blob}\n"
                    "请依据【工具结果】用 JSON 短句回答；不要再重复同一 lookup、look 或 web_search，除非结果不够。"
                    "需要某条结果的正文再声明 web_fetch，url 必须来自结果本身。"
                    "无结果或失败就说明没搜到，禁止编造 URL。"
                    "若本轮【工具结果】已有 hero_look 且 ok/ref_available：禁止再 look；"
                    "用户要画就直接 {\"type\":\"draw\",\"prompt\":\"场景画风\",\"use_ref\":true}，可带一句短 text；"
                    "只问长相就用 text 概括 desc，不要空口编。"
                ),
            }
        )
        raw = await self._llm_complete(messages, call_settings, abort_event=abort_event)
        self._write_trace(
            req,
            {
                "event": "persona",
                "reason": reason,
                "model": getattr(call_settings, "llm_model", ""),
                "messages": shrink(messages),
                "raw": raw,
            },
        )
        if abort_event.is_set():
            return bubbles, engagement
        return parse_persona_json(raw, max_replies=self.settings.max_replies)

    async def _maybe_game_lookup(
        self,
        req: ChatRequest,
        ml: GroupMainline,
        text: str,
        bubbles: list,
        engagement: str,
        *,
        shelf_items: list[ShelfItem] | None,
        call_settings,
        abort_event: asyncio.Event,
        reason: str,
    ) -> tuple[list, str]:
        """图鉴 lookup 与联网搜索同步回注。搜完若要打开正文，再给一轮 web_fetch。"""
        bubbles, engagement = await self._follow_declared_tools(
            req,
            ml,
            text,
            bubbles,
            engagement,
            shelf_items=shelf_items,
            call_settings=call_settings,
            abort_event=abort_event,
            reason=reason,
        )
        if abort_event.is_set():
            return bubbles, engagement
        pending_web = [
            b
            for b in bubbles
            if isinstance(b, dict) and b.get("type") in {"web_search", "web_fetch"}
        ]
        if not pending_web or not getattr(self.settings, "chat_web_search_enabled", True):
            return bubbles, engagement
        return await self._follow_declared_tools(
            req,
            ml,
            text,
            bubbles,
            engagement,
            shelf_items=shelf_items,
            call_settings=call_settings,
            abort_event=abort_event,
            reason=reason,
            allow_game=False,
        )

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
            self._write_trace(
                req,
                {
                    "event": "persona",
                    "reason": reason,
                    "model": getattr(call_settings, "llm_model", ""),
                    "messages": shrink(messages),
                    "raw": raw,
                },
            )
            if abort_event.is_set():
                return ChatData(action="skip", reason="aborted", turn_gen=turn, aborted=True)
            bubbles, engagement = parse_persona_json(raw, max_replies=self.settings.max_replies)
            bubbles, engagement = await self._maybe_game_lookup(
                req,
                ml,
                text,
                bubbles,
                engagement,
                shelf_items=shelf_items,
                call_settings=call_settings,
                abort_event=abort_event,
                reason=reason,
            )
            if abort_event.is_set():
                return ChatData(action="skip", reason="aborted", turn_gen=turn, aborted=True)
            bubbles = [
                b
                for b in bubbles
                if not (
                    isinstance(b, dict)
                    and b.get("type")
                    in {"lookup", "expand", "web_search", "web_fetch", "look"}
                )
            ]
            tts_req = next((b for b in bubbles if isinstance(b, dict) and b.get("type") == "tts"), None)
            if tts_req:
                spoken = str(tts_req.get("text") or "").strip()
                gid = req.session.group_id or _group_id_from_session(req.session.session_id)
                if spoken and tts_ready(self.settings, group_id=gid):
                    speed = tts_req.get("speed")
                    try:
                        speed_f = float(speed) if speed is not None else None
                    except (TypeError, ValueError):
                        speed_f = None
                    style = str(tts_req.get("style") or "").strip() or None
                    self._apply_heat_engagement(req, ml, engagement, reason=reason)
                    return await self._start_tts_job(
                        req,
                        ml,
                        text=spoken,
                        speed=speed_f,
                        style=style,
                        turn=turn,
                    )
                # 未就绪：静默丢掉 tts，继续其它气泡
                bubbles = [
                    b for b in bubbles if not (isinstance(b, dict) and b.get("type") == "tts")
                ]

            draw_req = next((b for b in bubbles if isinstance(b, dict) and b.get("type") == "draw"), None)
            if draw_req and self.settings.tools_enabled:
                try:
                    ack = ""
                    for b in bubbles:
                        if (
                            isinstance(b, dict)
                            and (b.get("type") or "text") == "text"
                            and b.get("text")
                        ):
                            ack = str(b["text"]).strip()
                            break
                    if ack:
                        ack, _ = sanitize_outgoing(ack, None)
                    self._apply_heat_engagement(req, ml, engagement, reason=reason)
                    size = parse_size_spec(
                        draw_req.get("size"),
                        width=draw_req.get("width"),
                        height=draw_req.get("height"),
                    )
                    user_srcs = self._draw_sources(req)
                    sources = user_srcs
                    if not sources and draw_req.get("use_ref"):
                        ref = getattr(ml, "pending_look_ref", None) or {}
                        path = str(ref.get("path") or "").strip()
                        if path:
                            from pathlib import Path

                            if Path(path).is_file():
                                sources = [path]
                                ml.pending_look_ref = None
                    return await self._start_draw_job(
                        req,
                        ml,
                        text,
                        prompt=str(draw_req.get("prompt") or text),
                        sources=sources,
                        size=size,
                        ack_text=ack or None,
                        turn=turn,
                    )
                except Exception as err:
                    _logger.exception("start draw after look failed: %s", err)
                    self._write_trace(
                        req,
                        {
                            "event": "draw_error",
                            "error": str(err)[:300],
                            "draw_req": {
                                k: draw_req.get(k)
                                for k in ("prompt", "use_ref", "size")
                                if k in draw_req
                            },
                        },
                    )
                    # fall through：尽量把 text ack 发出去，避免「完全没反应」
                    bubbles = [
                        b
                        for b in bubbles
                        if not (isinstance(b, dict) and b.get("type") == "draw")
                    ]

            bubbles = [
                b
                for b in bubbles
                if not (isinstance(b, dict) and b.get("type") in {"tts", "draw"})
            ]
            # 故意空 replies = 本轮不说话（仍应用 engagement）
            if not bubbles:
                self._apply_heat_engagement(req, ml, engagement, reason=reason, spoke=False)
                ml.append_timeline(
                    {"type": "bot", "replies": [], "turn_gen": turn, "empty": True},
                    self.settings.timeline_limit,
                )
                return ChatData(action="skip", reason="empty_reply", turn_gen=turn)

            replies = resolve_sticker_bubbles(
                bubbles,
                self._sticker_index(),
                self.settings,
                shelf_items=shelf_items,
            )
            if not replies:
                # 有气泡声明但全被过滤：仍视为空回，不硬塞兜底话
                self._apply_heat_engagement(req, ml, engagement, reason=reason, spoke=False)
                ml.append_timeline(
                    {"type": "bot", "replies": [], "turn_gen": turn, "empty": True},
                    self.settings.timeline_limit,
                )
                return ChatData(action="skip", reason="empty_reply", turn_gen=turn)
            self._scrub_mentions(req, replies)
            ml.append_timeline(
                {"type": "bot", "replies": [r.model_dump() for r in replies], "turn_gen": turn},
                self.settings.timeline_limit,
            )
            ml.note_bot_reply()
            self._apply_heat_engagement(req, ml, engagement, reason=reason)
            self._persist_and_extract(req, text, replies)
            self._archive_bot(self._group_of(req), replies)
            self._write_trace(
                req,
                {
                    "event": "sent",
                    "reason": reason,
                    "replies": [r.model_dump() for r in replies],
                },
            )
            return ChatData(action="reply", reason=reason, turn_gen=turn, replies=replies)
        except LLMError as err:
            if "aborted" in str(err).lower() or abort_event.is_set():
                return ChatData(action="skip", reason="aborted", turn_gen=turn, aborted=True)
            _logger.warning("llm failed: %s", err)
            if self._is_active_initiate(req) or reason in {"heat_reply", "bot_name"}:
                return ChatData(
                    action="reply",
                    reason="llm_error",
                    turn_gen=turn,
                    replies=[ReplyBubble(type="text", text="刚才脑子短路了一下，稍后再找我~")],
                )
            return ChatData(action="skip", reason="llm_error", turn_gen=turn)

    def _scrub_mentions(
        self,
        req: ChatRequest | None,
        replies: list[ReplyBubble],
        *,
        known: dict[str, str] | None = None,
    ) -> None:
        """mention 只保留合法 QQ；昵称能映射则纠正，否则丢掉（防 @空气/@错人）。"""
        table = known
        if table is None and req is not None:
            focus: list[str] = []
            try:
                if self.settings.chat_heat_enabled:
                    heat = load_heat(self._group_of(req))
                    pid = str(heat.partner_id or "").strip()
                    if pid:
                        focus = [pid]
                    else:
                        focus = [str(x) for x in (heat.focus_user_ids or []) if str(x).strip()]
            except Exception:
                focus = []
            table = build_known_users(
                message=req.message if isinstance(req.message, dict) else None,
                recent=list(req.recent or []),
                focus_user_ids=focus,
            )
        table = table or {}
        for bubble in replies:
            if bubble.type == "text":
                cleaned, mention = sanitize_outgoing(bubble.text, bubble.mention, known=table)
                bubble.text = cleaned
                bubble.mention = mention
            elif bubble.mention:
                bubble.mention = sanitize_outgoing("", bubble.mention, known=table)[1]

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

        xingyuan = is_xingyuan_group(req.session.group_name)
        if xingyuan:
            addon = load_xingyuan_persona()
            if addon:
                persona = f"{persona}\n\n{addon}"
        caps = ""
        if xingyuan:
            try:
                caps = capability_block()
            except Exception as err:
                _logger.warning("help capabilities failed: %s", err)

        system = persona
        if caps:
            system = f"{system}\n\n{caps}"
        if xingyuan and getattr(self.settings, "chat_game_kb_enabled", True):
            try:
                from src.chat.game_kb import game_l0_block

                block = game_l0_block(
                    self_hero_id=str(
                        getattr(self.settings, "chat_game_self_hero_id", "101003") or "101003"
                    ),
                    max_chars=int(
                        getattr(self.settings, "chat_game_l0_max_chars", 2800) or 2800
                    ),
                )
                if block:
                    system = f"{system}\n\n{block}"
            except Exception as err:
                _logger.warning("game L0 inject failed: %s", err)
            system = (
                f"{system}\n\n"
                "【图鉴工具｜本轮可声明】\n"
                "- 闲聊里出现没把握的星原专名（角色/奇波/套装/道具等），"
                "replies 必须带 lookup 或 expand；禁止只说「去查查」却不声明工具。\n"
                '- lookup：{"type":"lookup","kind":"hero|pet|suit|item|accessory|spirit|element|group|profession","q":"名称或id"}\n'
                '- expand：{"type":"expand","from_kind":"suit|hero|...","id":"图鉴id","edges":["relatedPet","element","profession","group"]}\n'
                "- kind 提示：角色→hero，奇波→pet，蝶语迷梦等套装→suit（不是 pet）。"
                "选错会 miss，换 kind 再查，不要编造。\n"
                "- 有【工具结果】再用 text 答；整页列表/面板才引导 ~指令。\n"
                "- 对方追问「是谁/认识吗/干啥的」：必须答出事实。"
                "刚查过可复述【近期群聊】里的结论；否则 lookup。"
                "禁止只回「查过了还问」却不给信息。"
            )
        if getattr(self.settings, "chat_web_search_enabled", True):
            atlas_line = "星原图鉴仍用 lookup，不要用联网编游戏数值。" if xingyuan else "不要用联网编游戏数值。"
            system = (
                f"{system}\n\n"
                "【联网工具｜本轮可声明】\n"
                "- 闲聊里出现你不确定的实时事实（新闻、天气、版本、价格、今天的事）时，"
                "replies 里声明 web_search。"
                f"{atlas_line}\n"
                '- 搜索：{"type":"web_search","q":"检索词","intent":"general|tech|academic|finance|social|privacy"}\n'
                '- 打开某条结果正文：{"type":"web_fetch","url":"上一步结果里的真实链接"}\n'
                "- 搜索只返回标题、摘要和链接，不抓正文。无结果或失败就说没搜到，禁止编造 URL。\n"
                "- 有【工具结果】再用 text 短句回答；链接必须来自结果，不要凭记忆补。"
            )
        if xingyuan and getattr(self.settings, "chat_hero_look_enabled", True):
            system = (
                f"{system}\n\n"
                "【外观工具｜本轮可声明】\n"
                "- 用户问长相/立绘/「画一张你」需要角色外观时：replies 加 "
                '{"type":"look","q":"角色名|self|"}；空或 self = 自己。\n'
                "- 【工具结果】含 desc 与 ref_available；不要编造五官。\n"
                '- 要按该长相画画：再声明 {"type":"draw","prompt":"场景画风","use_ref":true}；'
                "有用户图时仍优先用户图。"
            )
        if self.settings.tools_enabled:
            system = (
                f"{system}\n\n"
                "【画画工具】用户要画图或改图时，在 replies 里加 "
                '{"type":"draw","prompt":"画面或修改说明","size":"可选宽x高如1920x1080"}；'
                "也可写 width/height。"
                + ("按 look 长相时加 \"use_ref\":true。" if xingyuan else "")
                + "默认竖屏手机比例；用户明确说横图/方图/具体分辨率时再填 size。"
                "改图不填 size 时按原图宽高。可同时有一句短 text 作应答。"
                "当前消息带普通图时会按参考图编辑，否则文生图"
                + ("（或 use_ref 挂 look 立绘）" if xingyuan else "")
                + "。"
                "不要假装已经画好或已发出图片；工具异步完成后系统会再让你收尾。"
            )
        gid_tts = req.session.group_id or _group_id_from_session(req.session.session_id)
        if tts_ready(self.settings, group_id=gid_tts):
            max_c = int(getattr(self.settings, "chat_tts_max_chars", 80) or 80)
            system = (
                f"{system}\n\n"
                "【语音工具｜本轮可声明】\n"
                "- 想发 QQ 语音条时，在 replies 里加 "
                '{"type":"tts","text":"要念的短句","speed":1.0,"style":"可选情绪"}。\n'
                f"- text 必填，尽量短（上限约 {max_c} 字）；speed/style 可选。\n"
                "- 成功时群里**只发语音条**，不要同时再发同一句文字；不要空口说「发语音了」。\n"
                "- 长解释、列表、指令引导用 text；语音留给短句、情绪、强调。"
            )
        if mem_extra:
            system = f"{system}\n\n{mem_extra}"

        if self.settings.chat_heat_enabled:
            try:
                heat = self._ensure_heat(ml, req)
                sess = "dwelling" if str(heat.session or "") == "dwelling" else "away"
                uid = _sender_id(req.message)
                partner = str(heat.partner_id or "").strip()
                known = build_known_users(
                    message=req.message if isinstance(req.message, dict) else None,
                    recent=list(req.recent or []),
                    focus_user_ids=[partner] if partner else None,
                )
                qq_to_nick: dict[str, str] = {}
                for nick, qq in known.items():
                    if nick == qq:
                        continue
                    qq_to_nick.setdefault(qq, nick)
                cur_nick = qq_to_nick.get(uid or "", "")
                cur = f"{cur_nick}({uid})" if cur_nick and uid else (uid or "未知")
                system = (
                    f"{system}\n\n"
                    f"【看群状态】session={sess}；本轮触发相关发送者：{cur}。\n"
                    "你在刷群/驻留时开口，不是私聊接龙，也不是每条都要接："
                    "多数时候旁听就好；只对真正需要你的那句/话题开口。"
                    "别人互聊、起哄、刷表情时用空 replies:[]，别句句插嘴嘲讽。\n"
                    "若近期有人 @你 提问还没答上，优先答问，别被表情/路人图带跑。\n"
                    "engagement：hold 继续待着，down 兴趣下降少说话，leave 不想再听。\n"
                    "默认不要填 mention。若确需 @，mention 只能填括号里的纯数字 QQ，禁止填昵称。"
                )
            except Exception as err:
                _logger.warning("focus inject failed: %s", err)

        disk_lines: list[str] = []
        if group_id:
            try:
                # 人设上下文：优先「上次开口之后」未读，避免长时间 away 后失忆
                disk_lines = load_transcript_since_bot(group_id, with_time=True)
            except Exception as err:
                _logger.warning("transcript load failed: %s", err)
        recent_lines: list[str] = []
        for item in (req.recent or [])[-20:]:
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
            key = unstamp_line(line)
            if not key or key in seen or (current_line and key == current_line):
                continue
            seen.add(key)
            merged.append(line.strip())
        recent_lines = merged[-80:]

        timeline_lines: list[str] = []
        for ev in ml.timeline[-20:]:
            typ = ev.get("type")
            if typ == "user":
                timeline_lines.append(f"{ev.get('user')}: {ev.get('text')}")
            elif typ == "bot":
                for r in ev.get("replies") or []:
                    if not isinstance(r, dict):
                        continue
                    if r.get("text"):
                        timeline_lines.append(f"悠悠: {r['text']}")
                    elif r.get("type") == "image":
                        desc = str(r.get("sticker_desc") or "").strip() or "表情"
                        timeline_lines.append(f"悠悠: [表情包 {desc}]")
            elif typ == "tool_started":
                timeline_lines.append(f"[工具开始] {ev.get('name')}")
            elif typ == "tool_done":
                timeline_lines.append(f"[工具完成] {ev.get('name')}")

        jobs = ml.running_jobs()
        busy = "、".join(j["name"] for j in jobs) if jobs else "无"

        user_payload = (
            f"【现在】{format_now()}\n"
            "【近期群聊】\n"
            + ("\n".join(recent_lines) or "（无）")
            + "\n\n【主线摘要】\n"
            + ("\n".join(timeline_lines) or "（无）")
            + f"\n\n【进行中工具】{busy}\n"
            + f"【本轮合并输入】{_sender_label(req.message)} 相关：{_with_media_placeholders(req.message, text)}\n"
            + "（时间看群：以上是触发本轮时的相关输入+近况，不是命令你必须回「最后一个人」。"
            "看整段决定对谁、对哪个话题开口；有未答的@提问优先答。）\n"
            + "请按 persona 用 JSON replies 回复：默认只 1 条短句，勿刷屏。"
        )
        if shelf_items:
            user_payload += format_shelf_prompt(list(shelf_items))
        image_urls = select_vision_urls(
            message=req.message,
            recent=list(req.recent or []),
            settings=self.settings,
            referring=is_referring(text),
        )
        system = f"{system}\n\n{group_scope_note(req.session.group_name)}"
        if not xingyuan:
            plain = load_plain_persona()
            if plain:
                system = f"{system}\n\n{plain}"
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
