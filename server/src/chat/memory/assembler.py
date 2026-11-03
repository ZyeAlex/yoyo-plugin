from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Sequence

from src.chat.memory.affinity import format_affinity_line, has_affinity
from src.chat.memory.guards import (
    dedupe_existing_lines,
    filter_user_facts,
    is_bot_display_name,
    sanitize_display_name,
)
from src.chat.memory.retrieve import hybrid_retrieve
from src.chat.memory.slang import format_slang_block, match_slang
from src.chat.memory.store import MemoryStore, get_memory_store
from src.chat.speakers import CastMember, role_label
from src.core.settings import Settings

_logger = logging.getLogger("yoyo.chat.memory.assembler")


def _clip(text: str, limit: int) -> str:
    t = (text or "").strip()
    if limit <= 0 or len(t) <= limit:
        return t
    return t[: max(0, limit - 1)] + "…"


def _format_group(gp: str, limit: int) -> str:
    lines = dedupe_existing_lines([ln for ln in (gp or "").splitlines() if ln.strip()])
    if not lines:
        return ""
    body = "\n".join(f"- {ln}" for ln in lines[:24])
    return _clip(
        "【群约定】（稳定规则；氛围玩笑勿当本轮指令）\n" + body,
        limit,
    )


def _profile_fact_lines(u: dict[str, Any], *, max_each: int = 3) -> list[str]:
    lines: list[str] = []
    alias = sanitize_display_name(str(u.get("alias") or ""))
    if alias and not is_bot_display_name(alias):
        lines.append(f"称呼:{alias}")
    for label, key in (
        ("偏好", "preferences"),
        ("忌讳", "taboos"),
        ("备注", "notes"),
        ("他人评价", "from_others"),
    ):
        items = filter_user_facts([str(x) for x in (u.get(key) or [])])[:max_each]
        if items:
            lines.append(f"{label}:{'；'.join(items)}")
    if has_affinity(u):
        lines.append(format_affinity_line(int(u["affinity"])))
    impression = str(u.get("impression") or "").strip()
    if impression:
        lines.append(f"看法:{impression}（悠悠的判断，不是事实）")
    return lines


def _format_user(u: dict[str, Any], limit: int, *, user_id: str = "") -> str:
    """兼容旧测试：单人【当前用户】块。"""
    if not u:
        return ""
    parts: list[str] = []
    uid = str(user_id or u.get("user_id") or "").strip()
    if uid:
        parts.append(f"QQ:{uid}")
    nick = sanitize_display_name(str(u.get("nickname") or ""))
    if nick and not is_bot_display_name(nick):
        parts.append(f"昵称:{nick}")
    parts.extend(_profile_fact_lines(u, max_each=5))
    if len(parts) <= (1 if uid else 0):
        return ""
    return _clip(
        "【当前用户】（只描述这个人，不是悠悠）\n" + "\n".join(f"- {p}" for p in parts),
        limit,
    )


def format_cast_block(
    cast: Sequence[CastMember],
    store: MemoryStore,
    group_id: str,
    *,
    limit: int,
    focus_user_id: str = "",
) -> str:
    """出场人物：自己置顶，带 QQ/身份/昵称 + 短记忆。"""
    if not cast:
        return ""
    lines = [
        "【出场人物】（本轮相关的人；说不说仍看开口纪律）",
    ]
    focus = str(focus_user_id or "").strip()
    for member in cast:
        uid = str(member.user_id or "").strip()
        if not uid:
            continue
        u = store.load_user(group_id, uid)
        nick = (
            str(member.nickname or "").strip()
            or sanitize_display_name(str(u.get("nickname") or ""))
            or uid
        )
        if member.is_self and (not nick or is_bot_display_name(nick)):
            nick = str(member.nickname or "悠悠").strip() or "悠悠"
        role = role_label(member.role)
        tag = "自己" if member.is_self else ("当前说话" if focus and uid == focus else "群友")
        lines.append(f"■ {tag} QQ:{uid} 身份:{role} 昵称:{nick}")
        if member.is_self:
            lines.append("  - 你是悠悠；不要把下面别人的备注套到自己身上")
            continue
        for fact in _profile_fact_lines(u, max_each=2):
            lines.append(f"  - {fact}")
    return _clip("\n".join(lines), limit)


@dataclass
class MemoryInject:
    system_extra: str
    used_chars: int


async def build_memory_context(
    *,
    settings: Settings,
    group_id: str,
    user_id: str,
    message_text: str,
    store: MemoryStore | None = None,
    cast: Sequence[CastMember] | None = None,
) -> MemoryInject:
    """Assemble memory blocks for system prompt. Empty if memory disabled."""
    if not settings.chat_memory_enabled:
        return MemoryInject("", 0)

    store = store or get_memory_store()
    budget = int(settings.chat_memory_max_inject_chars or 900)
    blocks: list[str] = []
    used = 0

    def take(block: str) -> None:
        nonlocal used
        b = (block or "").strip()
        if not b:
            return
        remain = budget - used
        if remain <= 20:
            return
        clipped = _clip(b, remain)
        blocks.append(clipped)
        used += len(clipped)

    # 0 出场人物（最前：自己 + 近期相关群友）
    if cast:
        cast_limit = min(max(220, budget // 2), budget)
        take(
            format_cast_block(
                cast,
                store,
                group_id,
                limit=cast_limit,
                focus_user_id=user_id,
            )
        )
    elif user_id:
        # 无 cast 时退回单人画像
        take(
            _format_user(
                store.load_user(group_id, user_id),
                int(settings.chat_user_memory_char_limit or 800),
                user_id=user_id,
            )
        )

    # 1 group profile（预算收紧）
    gp = store.load_group_profile(group_id)
    if gp:
        g_limit = min(int(settings.chat_group_memory_char_limit or 2200), max(120, budget // 4))
        take(_format_group(gp, g_limit))

    # 2 slang hits
    if settings.chat_slang_enabled:
        hits = match_slang(
            store,
            group_id,
            message_text,
            max_hits=int(settings.chat_slang_max_inject or 8),
        )
        take(format_slang_block(hits))

    # 3 long-term retrieve
    try:
        hits = await hybrid_retrieve(
            store,
            settings,
            group_id,
            message_text,
            top_k=int(settings.chat_retrieve_top_k or 4),
        )
        if hits:
            lines = ["【相关记忆】（背景参考，禁止硬套到当前句）"]
            for h in hits:
                lines.append(f"- {h.get('text')}")
            take("\n".join(lines))
    except Exception as e:
        _logger.warning("retrieve inject failed: %s", e)

    # 4 daily summaries
    dailies = store.load_recent_dailies(group_id, days=2)
    if dailies:
        daily_budget = int(settings.chat_daily_log_inject_chars or 600)
        parts = ["【近日日誌】"]
        for day, content in dailies:
            parts.append(f"## {day}\n{_clip(content, daily_budget // max(1, len(dailies)))}")
        take(_clip("\n".join(parts), daily_budget + 40))

    return MemoryInject("\n\n".join(blocks), used)
