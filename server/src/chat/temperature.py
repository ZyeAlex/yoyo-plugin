"""时间看群：attention + dwelling 驻留 + 空手退避。

P0：docs/superpowers/specs/2026-10-28-time-glance-heat-design.md
P0.5：docs/superpowers/specs/2026-10-28-dwell-backoff-heat-design.md
"""

from __future__ import annotations

import json
import math
import random
import re
import time
from dataclasses import asdict, dataclass, field
from typing import Literal, Sequence

from src.chat.memory.paths import group_dir

Engagement = Literal["up", "hold", "down", "leave"]
_ENGAGE_OK = frozenset({"up", "hold", "down", "leave"})

# 默认端点（秒）；可被 Settings 覆盖后传入
DEFAULT_IDLE_SEC = (1500.0, 3600.0)
DEFAULT_CHAT_SEC = (20.0, 40.0)
DEFAULT_FOCUS_SEC = (3.0, 8.0)
DEFAULT_SPEAK_GAP_SEC = (3.0, 5.0)
DEFAULT_AT_REACTION_SEC = (2.0, 8.0)
DEFAULT_DECAY_PER_MIN = 0.92
DEFAULT_UNANSWERED_GIVE_UP = 480.0
DEFAULT_DWELL_HOT_SEC = (60.0, 180.0)
DEFAULT_DWELL_CHAT_SEC = (30.0, 90.0)
DEFAULT_DWELL_IDLE_SEC = (10.0, 30.0)
DEFAULT_BACKOFF_RETRY_SEC = (90.0, 300.0, 900.0, 1800.0, 3600.0)
DEFAULT_BACKOFF_ATTENTION_FACTOR = 0.5
# 磁盘里的异常大数；真正封顶跟配置档数走
_EMPTY_STREAK_STORE_CAP = 64
DWELL_EXTEND_SEC = 60.0
FLOOR_UNANSWERED = 0.32
FLOOR_PENDING = 0.90

SessionKind = Literal["away", "dwelling"]


@dataclass
class HeatState:
    # —— P0 时间看群 ——
    attention: float = 0.12
    attention_floor: float = 0.0
    floor_until: float = 0.0
    next_glance_at: float = 0.0  # P0.5：下次进入 dwelling
    last_glance_at: float = 0.0  # P0.5：上次进入 dwelling
    last_speak_at: float = 0.0
    last_human_at: float = 0.0
    pending_glance_span: float = 0.0  # 与 last_interval 同步
    last_interval: float = 0.0
    pending_at: bool = False
    earliest_speak_at: float = 0.0  # 旧 @ 反应钩子，不再用来推迟开口
    last_decide_at: float = 0.0  # 上一次决定进人设的时刻
    partner_id: str = ""  # P0 只写不读
    # —— P0.5 驻留 ——
    session: str = "away"
    dwell_until: float = 0.0
    empty_streak: int = 0
    had_interaction_this_dwell: bool = False
    # —— 兼容旧字段（不驱动决策）——
    temperature: float = 0.15
    mode: str = "idle"
    unread: int = 0
    silent_streak: int = 0
    backoff_until: float = 0.0
    engaged_until: float = 0.0
    observe_until: float = 0.0
    chime_at: float = 0.0
    window_replies: int = 0
    focus_user_ids: list[str] = field(default_factory=list)


def heat_path(group_id: str):
    return group_dir(group_id) / "heat.json"


def load_heat(group_id: str) -> HeatState:
    path = heat_path(group_id)
    if not path.exists():
        return HeatState()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return HeatState()
    if not isinstance(data, dict):
        return HeatState()
    state = HeatState()
    for key in asdict(state):
        if key in data:
            setattr(state, key, data[key])
    state.attention = _clamp01(float(state.attention or 0.12))
    state.attention_floor = max(0.0, min(1.0, float(state.attention_floor or 0)))
    state.partner_id = str(state.partner_id or "").strip()
    sess = str(state.session or "away").strip().lower()
    state.session = "dwelling" if sess == "dwelling" else "away"
    state.empty_streak = max(0, min(_EMPTY_STREAK_STORE_CAP, int(state.empty_streak or 0)))
    state.had_interaction_this_dwell = bool(state.had_interaction_this_dwell)
    if float(state.last_interval or 0) <= 0 and float(state.pending_glance_span or 0) > 0:
        state.last_interval = float(state.pending_glance_span)
    if not isinstance(state.focus_user_ids, list):
        state.focus_user_ids = []
    state.focus_user_ids = [str(x) for x in state.focus_user_ids if str(x).strip()]
    if not state.partner_id and state.focus_user_ids:
        state.partner_id = str(state.focus_user_ids[0])
    _sync_focus(state)
    # 旧盘迁移：有 temperature 无 attention 时粗映射
    if "attention" not in data and "temperature" in data:
        state.attention = _clamp01(float(state.temperature or 0.15))
    return state


def save_heat(group_id: str, state: HeatState) -> None:
    if not group_id:
        return
    _sync_focus(state)
    path = heat_path(group_id)
    path.write_text(json.dumps(asdict(state), ensure_ascii=False), encoding="utf-8")


def _name_hit_not_embedded(raw: str, name: str) -> bool:
    """「悠悠」命中，但左边是汉字（寒悠悠）则不算点名。"""
    if not name or name not in raw:
        return False
    is_han = re.compile(r"[\u4e00-\u9fff]").match
    idx = 0
    while True:
        i = raw.find(name, idx)
        if i < 0:
            return False
        before = raw[i - 1] if i > 0 else ""
        if not (before and is_han(before)):
            return True
        idx = i + len(name)


def is_hard_trigger(
    text: str,
    *,
    at_bot: bool = False,
    wake: bool = False,
    reply_to: bool = False,
    names: list[str] | None = None,
) -> bool:
    if at_bot or wake or reply_to:
        return True
    raw = text or ""
    return any(_name_hit_not_embedded(raw, n) for n in (names or []) if n)


def thread_addresses_bot(
    *,
    at_bot: bool = False,
    reply_to_bot: bool = False,
    quotes_bot: bool = False,
) -> bool:
    """线程级「有人理我」：仅 @ / 回 bot / 引用 bot。"""
    return bool(at_bot or reply_to_bot or quotes_bot)


def log_uniform(lo: float, hi: float, *, rng: random.Random | None = None) -> float:
    a = max(1e-6, float(lo))
    b = max(a, float(hi))
    r = rng or random
    return math.exp(r.uniform(math.log(a), math.log(b)))


def endpoints_for_attention(
    attention: float,
    *,
    idle: Sequence[float] = DEFAULT_IDLE_SEC,
    chat: Sequence[float] = DEFAULT_CHAT_SEC,
    focus: Sequence[float] = DEFAULT_FOCUS_SEC,
) -> tuple[float, float]:
    """attention∈[0,1] → 间隔端点；0→idle，0.5→chat，1→focus，中间线性插值。"""
    t = _clamp01(attention)
    idle_lo, idle_hi = float(idle[0]), float(idle[1])
    chat_lo, chat_hi = float(chat[0]), float(chat[1])
    focus_lo, focus_hi = float(focus[0]), float(focus[1])
    if t <= 0.5:
        w = t / 0.5
        lo = idle_lo * (1 - w) + chat_lo * w
        hi = idle_hi * (1 - w) + chat_hi * w
    else:
        w = (t - 0.5) / 0.5
        lo = chat_lo * (1 - w) + focus_lo * w
        hi = chat_hi * (1 - w) + focus_hi * w
    return min(lo, hi), max(lo, hi)


def sample_glance_interval(
    attention: float,
    *,
    idle: Sequence[float] = DEFAULT_IDLE_SEC,
    chat: Sequence[float] = DEFAULT_CHAT_SEC,
    focus: Sequence[float] = DEFAULT_FOCUS_SEC,
    rng: random.Random | None = None,
) -> float:
    lo, hi = endpoints_for_attention(attention, idle=idle, chat=chat, focus=focus)
    return log_uniform(lo, hi, rng=rng)


def sample_range(bounds: Sequence[float], *, rng: random.Random | None = None) -> float:
    lo, hi = float(bounds[0]), float(bounds[1])
    if hi < lo:
        lo, hi = hi, lo
    r = rng or random
    return r.uniform(lo, hi)


def effective_attention(state: HeatState, now: float) -> float:
    _refresh_floor(state, now)
    return max(_clamp01(float(state.attention or 0)), float(state.attention_floor or 0))


def decay_attention(
    state: HeatState,
    now: float,
    *,
    decay_per_min: float = DEFAULT_DECAY_PER_MIN,
    last_tick: float | None = None,
) -> None:
    """按时间衰减；不低于 floor。松 floor 后从当前值继续衰减，不清零。"""
    _refresh_floor(state, now)
    prev = float(last_tick if last_tick is not None else state.last_glance_at or state.last_speak_at or now)
    if prev <= 0:
        prev = now
    minutes = max(0.0, (now - prev) / 60.0)
    if minutes <= 0:
        state.attention = max(_clamp01(state.attention), float(state.attention_floor or 0))
        return
    factor = float(decay_per_min) ** minutes
    state.attention = max(_clamp01(float(state.attention or 0) * factor), float(state.attention_floor or 0))


def _refresh_floor(state: HeatState, now: float) -> None:
    if state.pending_at:
        state.attention_floor = max(float(state.attention_floor or 0), FLOOR_PENDING)
        return
    until = float(state.floor_until or 0)
    if until > 0 and now >= until:
        state.attention_floor = 0.0
        state.floor_until = 0.0
        # 不把 attention 清零，只去掉下限
        return
    if until > now:
        state.attention_floor = max(float(state.attention_floor or 0), FLOOR_UNANSWERED)


def note_human(state: HeatState, now: float) -> None:
    state.last_human_at = float(now)


def dwell_duration(
    attention: float,
    *,
    hot: Sequence[float] = DEFAULT_DWELL_HOT_SEC,
    chat: Sequence[float] = DEFAULT_DWELL_CHAT_SEC,
    idle: Sequence[float] = DEFAULT_DWELL_IDLE_SEC,
    rng: random.Random | None = None,
) -> float:
    att = _clamp01(attention)
    if att > 0.7:
        bounds = hot
    elif att > 0.4:
        bounds = chat
    else:
        bounds = idle
    return sample_range(bounds, rng=rng)


def _backoff_bases(retry: Sequence[float] | None) -> list[float]:
    bases: list[float] = []
    for raw in retry or ():
        try:
            num = float(raw)
        except (TypeError, ValueError):
            continue
        if num > 0:
            bases.append(num)
    return bases or list(DEFAULT_BACKOFF_RETRY_SEC)


def sample_backoff(
    attention: float,
    empty_streak: int,
    *,
    idle: Sequence[float] = DEFAULT_IDLE_SEC,
    chat: Sequence[float] = DEFAULT_CHAT_SEC,
    focus: Sequence[float] = DEFAULT_FOCUS_SEC,
    retry: Sequence[float] = DEFAULT_BACKOFF_RETRY_SEC,
    attention_factor: float = DEFAULT_BACKOFF_ATTENTION_FACTOR,
    rng: random.Random | None = None,
) -> float:
    bases = _backoff_bases(retry)
    streak = max(0, min(len(bases), int(empty_streak)))
    if streak <= 0:
        return sample_glance_interval(attention, idle=idle, chat=chat, focus=focus, rng=rng)
    idx = min(streak - 1, len(bases) - 1)
    base = bases[idx]
    factor = 1.0 - float(attention_factor) * _clamp01(attention)
    jitter = sample_range((0.8, 1.2), rng=rng)
    return max(1.0, base * factor * jitter)


def is_dwelling(state: HeatState) -> bool:
    return str(state.session or "") == "dwelling"


def enter_dwelling(
    state: HeatState,
    now: float,
    *,
    hot: Sequence[float] = DEFAULT_DWELL_HOT_SEC,
    chat: Sequence[float] = DEFAULT_DWELL_CHAT_SEC,
    idle: Sequence[float] = DEFAULT_DWELL_IDLE_SEC,
    rng: random.Random | None = None,
) -> float:
    """进入驻留；返回 dwell 时长。"""
    att = effective_attention(state, now)
    span = dwell_duration(att, hot=hot, chat=chat, idle=idle, rng=rng)
    state.session = "dwelling"
    state.dwell_until = float(now) + float(span)
    state.had_interaction_this_dwell = False
    state.last_glance_at = float(now)
    state.temperature = max(0.1, min(1.0, att))
    return span


def extend_dwelling(state: HeatState, now: float, *, extra: float = DWELL_EXTEND_SEC) -> None:
    if not is_dwelling(state):
        return
    state.dwell_until = max(float(state.dwell_until or 0), float(now) + max(1.0, float(extra)))


def exit_dwelling(
    state: HeatState,
    now: float,
    *,
    idle: Sequence[float] = DEFAULT_IDLE_SEC,
    chat: Sequence[float] = DEFAULT_CHAT_SEC,
    focus: Sequence[float] = DEFAULT_FOCUS_SEC,
    retry: Sequence[float] = DEFAULT_BACKOFF_RETRY_SEC,
    attention_factor: float = DEFAULT_BACKOFF_ATTENTION_FACTOR,
    decay_per_min: float = DEFAULT_DECAY_PER_MIN,
    rng: random.Random | None = None,
) -> float:
    """退出驻留并排下次进场；返回 backoff 间隔。"""
    if state.had_interaction_this_dwell:
        state.empty_streak = 0
    else:
        cap = len(_backoff_bases(retry))
        state.empty_streak = min(cap, int(state.empty_streak or 0) + 1)
        state.attention = max(0.0, _clamp01(state.attention) - 0.08)
    state.session = "away"
    state.dwell_until = 0.0
    state.had_interaction_this_dwell = False
    return schedule_next_glance(
        state,
        now,
        idle=idle,
        chat=chat,
        focus=focus,
        retry=retry,
        attention_factor=attention_factor,
        decay_per_min=decay_per_min,
        empty_streak=int(state.empty_streak or 0),
        rng=rng,
    )


def dwell_expired(state: HeatState, now: float) -> bool:
    return is_dwelling(state) and float(state.dwell_until or 0) > 0 and now >= float(state.dwell_until)


def on_hard_trigger(
    state: HeatState,
    now: float,
    *,
    user_id: str = "",
    at_reaction: Sequence[float] = DEFAULT_AT_REACTION_SEC,
    hot: Sequence[float] = DEFAULT_DWELL_HOT_SEC,
    chat_dwell: Sequence[float] = DEFAULT_DWELL_CHAT_SEC,
    idle_dwell: Sequence[float] = DEFAULT_DWELL_IDLE_SEC,
    rng: random.Random | None = None,
) -> None:
    state.attention = 0.95
    state.pending_at = True
    state.attention_floor = FLOOR_PENDING
    state.floor_until = 0.0
    state.empty_streak = 0
    state.had_interaction_this_dwell = True
    if user_id:
        state.partner_id = str(user_id).strip()
        _sync_focus(state)
    # 被 @ 不额外愣一段时间。两次决定开口的间隔在进人格前用 last_decide_at 等。
    del at_reaction
    if is_dwelling(state):
        extend_dwelling(state, now, extra=DWELL_EXTEND_SEC)
    else:
        enter_dwelling(state, now, hot=hot, chat=chat_dwell, idle=idle_dwell, rng=rng)
        state.had_interaction_this_dwell = True


def on_thread_hit(state: HeatState, now: float) -> None:
    del now
    state.attention = min(1.0, _clamp01(state.attention) + 0.2)
    state.empty_streak = 0
    if is_dwelling(state):
        state.had_interaction_this_dwell = True


def on_speak_success(
    state: HeatState,
    now: float,
    *,
    unanswered_give_up: float = DEFAULT_UNANSWERED_GIVE_UP,
    hot: Sequence[float] = DEFAULT_DWELL_HOT_SEC,
    chat_dwell: Sequence[float] = DEFAULT_DWELL_CHAT_SEC,
    idle_dwell: Sequence[float] = DEFAULT_DWELL_IDLE_SEC,
    rng: random.Random | None = None,
) -> None:
    """本轮最后一条发出：抬 attention / floor；确保在 dwelling 并续期。不排 next_glance_at。"""
    state.last_speak_at = float(now)
    state.pending_at = False
    state.earliest_speak_at = 0.0
    state.attention = max(_clamp01(state.attention), 0.5)
    state.attention_floor = FLOOR_UNANSWERED
    state.floor_until = float(now) + max(60.0, float(unanswered_give_up))
    state.empty_streak = 0
    state.had_interaction_this_dwell = True
    # 开口后必须待在群里：旧盘/漏进场时补进 dwelling，避免又变成「说完等 20s」
    if not is_dwelling(state):
        enter_dwelling(state, now, hot=hot, chat=chat_dwell, idle=idle_dwell, rng=rng)
        state.had_interaction_this_dwell = True
    else:
        extend_dwelling(state, now, extra=DWELL_EXTEND_SEC)


def on_glance_silent(state: HeatState, now: float, *, thread_hit: bool) -> None:
    """Dwell 内 silent 不降 attention（退出空手时再 −0.08）。"""
    del thread_hit
    state.silent_streak = int(state.silent_streak or 0) + 1
    _refresh_floor(state, now)
    state.attention = max(_clamp01(state.attention), float(state.attention_floor or 0))


def schedule_next_glance(
    state: HeatState,
    now: float,
    *,
    idle: Sequence[float] = DEFAULT_IDLE_SEC,
    chat: Sequence[float] = DEFAULT_CHAT_SEC,
    focus: Sequence[float] = DEFAULT_FOCUS_SEC,
    retry: Sequence[float] = DEFAULT_BACKOFF_RETRY_SEC,
    attention_factor: float = DEFAULT_BACKOFF_ATTENTION_FACTOR,
    decay_per_min: float = DEFAULT_DECAY_PER_MIN,
    empty_streak: int | None = None,
    rng: random.Random | None = None,
) -> float:
    """排下次进入 dwelling 的时间（away 态）。"""
    decay_attention(state, now, decay_per_min=decay_per_min)
    att = effective_attention(state, now)
    streak = int(state.empty_streak if empty_streak is None else empty_streak)
    span = sample_backoff(
        att,
        streak,
        idle=idle,
        chat=chat,
        focus=focus,
        retry=retry,
        attention_factor=attention_factor,
        rng=rng,
    )
    state.pending_glance_span = float(span)
    state.last_interval = float(span)
    state.next_glance_at = float(now) + float(span)
    state.temperature = max(0.1, min(1.0, att))
    return span


def glance_due(state: HeatState, now: float) -> bool:
    """away 下是否该尝试进场。dwelling 中视为「已在场」。"""
    if is_dwelling(state):
        return True
    nxt = float(state.next_glance_at or 0)
    if nxt <= 0:
        return True
    return now >= nxt


def should_cold_skip(state: HeatState, now: float) -> bool:
    """完全无人说话超过 last_interval → 不进入 dwelling。"""
    span = float(state.last_interval or state.pending_glance_span or 0)
    if span <= 0:
        span = float(DEFAULT_IDLE_SEC[0])
    last_h = float(state.last_human_at or 0)
    if last_h <= 0:
        return True
    return (now - last_h) >= span


def speak_gap_ok(
    state: HeatState,
    now: float,
    *,
    speak_gap: Sequence[float] = DEFAULT_SPEAK_GAP_SEC,
) -> bool:
    last = float(state.last_speak_at or 0)
    if last <= 0:
        return True
    # 用区间下限作硬底（已发言后随机底线在 schedule 时不必再掷）
    need = float(speak_gap[0])
    return (now - last) >= need


def wait_for_earliest_speak(state: HeatState, now: float) -> float:
    """旧 @ 钩子剩余等待。新节奏不再调用。"""
    earliest = float(state.earliest_speak_at or 0)
    if earliest <= 0:
        return 0.0
    return max(0.0, earliest - now)


def speak_gap_wait(
    state: HeatState,
    now: float,
    *,
    speak_gap: Sequence[float] = DEFAULT_SPEAK_GAP_SEC,
) -> float:
    """距上次决定开口还差多少秒。不够就等，不丢这轮。下限取区间左端。"""
    floor = max(0.0, float(speak_gap[0])) if speak_gap else 0.0
    last = float(state.last_decide_at or 0)
    if last <= 0 or floor <= 0:
        return 0.0
    return max(0.0, last + floor - float(now))


def mark_leave(state: HeatState) -> None:
    state.attention = 0.1
    state.attention_floor = 0.0
    state.floor_until = 0.0
    state.pending_at = False
    state.earliest_speak_at = 0.0
    state.partner_id = ""
    state.focus_user_ids = []
    state.session = "away"
    state.dwell_until = 0.0
    state.empty_streak = 0
    state.had_interaction_this_dwell = False
    state.mode = "idle"
    state.temperature = 0.1
    state.engaged_until = 0.0
    state.observe_until = 0.0
    state.unread = 0
    state.silent_streak = 0
    state.backoff_until = 0.0
    state.chime_at = 0.0
    state.window_replies = 0


def normalize_engagement(value: object) -> Engagement:
    raw = str(value or "").strip().lower()
    if raw in _ENGAGE_OK:
        return raw  # type: ignore[return-value]
    return "hold"


def apply_engagement(
    state: HeatState,
    engagement: object,
    now: float,
    *,
    engaged_sec: float = 45.0,
    observe_sec: float = 90.0,
    user_id: str = "",
) -> Engagement:
    """P0：leave 清空；up/hold 略抬 attention；down 略降。partner 只写。"""
    del engaged_sec, observe_sec
    eng = normalize_engagement(engagement)
    if eng == "leave":
        mark_leave(state)
        return eng
    uid = str(user_id or "").strip()
    if uid:
        state.partner_id = uid
        _sync_focus(state)
    if eng == "down":
        state.attention = max(float(state.attention_floor or 0), _clamp01(state.attention) - 0.15)
        return eng
    if eng == "up":
        state.attention = min(1.0, max(_clamp01(state.attention), 0.7))
    else:
        state.attention = max(_clamp01(state.attention), 0.5)
    return eng


def parse_judge(raw: str) -> str:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return "silent"
    if not isinstance(data, dict):
        return "silent"
    action = str(data.get("action") or "")
    if action in {"reply", "silent", "leave"}:
        return action
    return "silent"


# —— 以下为旧 API 薄兼容（测试 / 旧调用）——


def batch_need(temperature: float) -> int:
    t = max(0.1, min(1.0, float(temperature or 0.15)))
    return max(1, min(10, math.ceil(1.0 / t)))


def smooth(temperature: float, score: float) -> float:
    return max(0.1, min(1.0, 0.85 * float(temperature) + 0.15 * float(score)))


def is_engaged(state: HeatState, now: float) -> bool:
    return effective_attention(state, now) >= 0.45


def is_observe(state: HeatState, now: float) -> bool:
    del now
    return str(state.mode or "") == "observe"


def is_partner(state: HeatState, user_id: str) -> bool:
    uid = str(user_id or "").strip()
    pid = str(state.partner_id or "").strip()
    return bool(uid and pid and uid == pid)


def in_focus(state: HeatState, user_id: str) -> bool:
    return is_partner(state, user_id)


def set_partner(state: HeatState, user_id: str) -> None:
    state.partner_id = str(user_id or "").strip()
    _sync_focus(state)


def add_focus(state: HeatState, user_id: str, *, cap: int = 1) -> None:
    del cap
    set_partner(state, user_id)


def enter_engaged(
    state: HeatState,
    now: float,
    *,
    user_id: str = "",
    engaged_sec: float = 45.0,
) -> None:
    del engaged_sec
    on_hard_trigger(state, now, user_id=user_id, at_reaction=(0.0, 0.0))
    state.earliest_speak_at = 0.0
    state.mode = "engaged"
    state.engaged_until = now + 90.0
    state.attention = max(state.attention, 0.85)


def enter_observe(state: HeatState, now: float, *, observe_sec: float = 90.0) -> None:
    state.mode = "observe"
    state.observe_until = now + max(15.0, float(observe_sec))
    state.engaged_until = 0.0


def note_chime(state: HeatState, now: float) -> None:
    on_speak_success(state, now)
    if is_dwelling(state):
        return
    schedule_next_glance(state, now)


def note_engaged_glance(state: HeatState, now: float) -> None:
    on_speak_success(state, now)
    if is_dwelling(state):
        return
    schedule_next_glance(state, now)


def stamp_speak(state: HeatState, now: float) -> None:
    state.last_speak_at = float(now)


def mark_silent(state: HeatState, now: float) -> None:
    on_glance_silent(state, now, thread_hit=False)


def on_incoming(
    state: HeatState,
    *,
    now: float,
    hard: bool,
    user_id: str = "",
    debounce_sec: float = 0.0,
    recent_speakers: list[str] | None = None,
    pointed_elsewhere: bool = False,
    observe_sec: float = 90.0,
    **_kwargs: object,
) -> str:
    """兼容旧测试：hard→reply；dwelling/due→judge；否则 batch。"""
    del debounce_sec, recent_speakers, pointed_elsewhere, observe_sec
    note_human(state, now)
    if hard:
        on_hard_trigger(state, now, user_id=user_id)
        return "reply"
    if is_dwelling(state):
        return "judge"
    if not glance_due(state, now):
        return "batch"
    if should_cold_skip(state, now):
        schedule_next_glance(state, now)
        return "batch"
    enter_dwelling(state, now)
    return "judge"


def detect_cross_talk(recent_speakers: list[str] | None, *, partner_id: str = "") -> bool:
    speakers = [str(s).strip() for s in (recent_speakers or []) if str(s).strip()]
    if len(speakers) < 2:
        return False
    tail = speakers[-4:]
    uniq = {s for s in tail}
    if partner_id:
        uniq.discard(str(partner_id))
    compressed: list[str] = []
    for s in tail:
        if not compressed or compressed[-1] != s:
            compressed.append(s)
    return len(uniq) >= 2 and len(compressed) >= 2


def _sync_focus(state: HeatState) -> None:
    pid = str(state.partner_id or "").strip()
    state.partner_id = pid
    state.focus_user_ids = [pid] if pid else []


def _clamp01(value: float) -> float:
    try:
        num = float(value)
    except (TypeError, ValueError):
        num = 0.12
    return min(1.0, max(0.0, num))
