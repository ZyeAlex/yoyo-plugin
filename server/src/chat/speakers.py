"""群友发言署名：QQ / 身份 / 昵称；出场人物收集。"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

_ROLE_LABEL = {
    "owner": "群主",
    "admin": "管理",
    "member": "群成员",
}
_LINE_RE = re.compile(
    r"^(?P<qq>\d{5,14})\s+(?P<role>群主|管理|群成员)\s+(?P<nick>.+?):\s*(?P<body>.*)$"
)
_OLD_NICK_RE = re.compile(r"^(?P<nick>.+?):\s*(?P<body>.*)$")


def role_label(role: object) -> str:
    key = str(role or "").strip().lower()
    return _ROLE_LABEL.get(key, "群成员")


def display_nickname(message: dict[str, Any] | None, *, fallback: str = "") -> str:
    message = message or {}
    sender = message.get("sender") if isinstance(message.get("sender"), dict) else {}
    for key in ("display", "card", "nickname"):
        nick = str(sender.get(key) or "").strip()
        if nick:
            return nick
    uid = str(message.get("user_id") or sender.get("user_id") or "").strip()
    return fallback or uid or "?"


def sender_role(message: dict[str, Any] | None) -> str:
    message = message or {}
    sender = message.get("sender") if isinstance(message.get("sender"), dict) else {}
    key = str(sender.get("role") or "").strip().lower()
    if key in _ROLE_LABEL:
        return key
    return "member"


def sender_qq(message: dict[str, Any] | None) -> str:
    message = message or {}
    sender = message.get("sender") if isinstance(message.get("sender"), dict) else {}
    return str(message.get("user_id") or sender.get("user_id") or "").strip()


def format_speaker_head(*, qq: str, role: str, nickname: str) -> str:
    q = str(qq or "").strip() or "?"
    raw = str(role or "").strip()
    r = raw if raw in ("群主", "管理", "群成员") else role_label(raw)
    nick = str(nickname or "").strip() or q
    return f"{q} {r} {nick}"


def format_message_line(message: dict[str, Any] | None, body: str) -> str:
    """不带时间的发言行：`QQ 身份 昵称: 正文`。"""
    text = (body or "").strip()
    if not text:
        return ""
    head = format_speaker_head(
        qq=sender_qq(message),
        role=sender_role(message),
        nickname=display_nickname(message),
    )
    return f"{head}: {text}"


def format_bot_line(
    body: str,
    *,
    bot_id: str,
    bot_nickname: str = "悠悠",
    role: str = "member",
) -> str:
    text = (body or "").strip()
    if not text:
        return ""
    head = format_speaker_head(qq=bot_id, role=role, nickname=bot_nickname or "悠悠")
    return f"{head}: {text}"


def parse_speaker_line(line: str) -> dict[str, str] | None:
    """解析 `QQ 身份 昵称: 正文`；旧 `昵称: 正文` 仅返回 nick。"""
    text = (line or "").strip()
    if not text:
        return None
    m = _LINE_RE.match(text)
    if m:
        return {
            "qq": m.group("qq"),
            "role": m.group("role"),
            "nickname": m.group("nick"),
            "body": m.group("body"),
        }
    m2 = _OLD_NICK_RE.match(text)
    if m2:
        return {
            "qq": "",
            "role": "",
            "nickname": m2.group("nick"),
            "body": m2.group("body"),
        }
    return None


def is_bot_speaker_line(line: str, *, bot_id: str = "", bot_nickname: str = "悠悠") -> bool:
    parsed = parse_speaker_line(line)
    if not parsed:
        return False
    nick = parsed.get("nickname") or ""
    qq = parsed.get("qq") or ""
    if bot_id and qq and qq == str(bot_id):
        return True
    if nick in {bot_nickname, "悠悠"}:
        return True
    return False


@dataclass
class CastMember:
    user_id: str
    nickname: str = ""
    role: str = "member"
    is_self: bool = False


def collect_cast(
    *,
    message: dict[str, Any] | None,
    recent: list[dict[str, Any]] | None,
    bot_id: str,
    bot_nickname: str = "悠悠",
    extra_user_ids: list[str] | None = None,
    max_cast: int = 8,
) -> list[CastMember]:
    """出场人物：自己 + 本轮/近期发言者（去重，自己置顶）。"""
    ordered: list[CastMember] = []
    seen: set[str] = set()

    def add(uid: str, *, nick: str = "", role: str = "member", is_self: bool = False) -> None:
        q = str(uid or "").strip()
        if not q or q in seen:
            return
        seen.add(q)
        ordered.append(
            CastMember(
                user_id=q,
                nickname=str(nick or "").strip(),
                role=str(role or "member").strip().lower() or "member",
                is_self=is_self,
            )
        )

    if bot_id:
        add(bot_id, nick=bot_nickname or "悠悠", role="member", is_self=True)

    if isinstance(message, dict):
        add(
            sender_qq(message),
            nick=display_nickname(message),
            role=sender_role(message),
        )
        # @ 到的人也算出场
        for seg in message.get("message") or []:
            if not isinstance(seg, dict) or str(seg.get("type") or "") != "at":
                continue
            data = seg.get("data") if isinstance(seg.get("data"), dict) else {}
            qq = str(seg.get("qq") or data.get("qq") or "").strip()
            name = str(seg.get("name") or data.get("name") or "").strip()
            if qq and qq.lower() not in {"all", "0"}:
                add(qq, nick=name)

    for item in recent or []:
        if not isinstance(item, dict):
            continue
        add(
            sender_qq(item),
            nick=display_nickname(item),
            role=sender_role(item),
        )

    for uid in extra_user_ids or []:
        add(str(uid))

    # 自己已在首；其余按出现顺序，总上限
    if len(ordered) <= max_cast:
        return ordered
    self_rows = [c for c in ordered if c.is_self]
    others = [c for c in ordered if not c.is_self][: max(0, max_cast - len(self_rows))]
    return self_rows + others
