"""出站回复净化：CQ 抽 mention；mention 必须是合法 QQ 数字，禁止昵称/@空气。"""

from __future__ import annotations

import re
from typing import Any

_CQ_AT = re.compile(r"\[CQ:at,qq=(\d+)(?:,name=([^,\]]*))?[^\]]*\]", re.I)
_CQ_ANY = re.compile(r"\[CQ:[^\]]+\]")
_DIGITS = re.compile(r"^\d{5,14}$")


def is_qq_id(value: object) -> bool:
    s = str(value or "").strip()
    return bool(_DIGITS.fullmatch(s))


def normalize_mention(
    mention: object,
    *,
    known: dict[str, str] | None = None,
) -> str | None:
    """只保留合法 QQ。昵称若在 known 映射里则换成 QQ，否则丢弃（避免 @空气/@错人）。"""
    raw = str(mention or "").strip()
    if not raw:
        return None
    # 模型有时写 "qq:123" / "@123"
    m = re.search(r"(\d{5,14})", raw)
    if m and (raw == m.group(1) or re.fullmatch(r"(?:qq[:：\s@]*)?\d{5,14}", raw, re.I)):
        return m.group(1)
    if is_qq_id(raw):
        return raw
    # 昵称 → QQ
    table = known or {}
    key = raw.lstrip("@").strip()
    if key in table and is_qq_id(table[key]):
        return str(table[key])
    # 模糊：known 的 key 被包含或相等
    for nick, qq in table.items():
        if not nick or not is_qq_id(qq):
            continue
        if nick == key or key in nick or nick in key:
            return str(qq)
    return None


def build_known_users(
    *,
    message: dict[str, Any] | None = None,
    recent: list[dict[str, Any]] | None = None,
    focus_user_ids: list[str] | None = None,
    extra: dict[str, str] | None = None,
) -> dict[str, str]:
    """昵称/备注 → QQ。用于把模型乱填的 mention 纠正或丢弃。"""
    out: dict[str, str] = {}

    def add(nick: object, uid: object) -> None:
        q = str(uid or "").strip()
        n = str(nick or "").strip()
        if not is_qq_id(q):
            return
        out[q] = q  # 允许直接写 QQ
        if n:
            out[n] = q
            out[n.lstrip("@")] = q

    if isinstance(message, dict):
        uid = message.get("user_id")
        sender = message.get("sender") if isinstance(message.get("sender"), dict) else {}
        add(sender.get("card") or sender.get("nickname"), uid)
        add(sender.get("nickname"), uid)
        for seg in message.get("message") or []:
            if not isinstance(seg, dict):
                continue
            if str(seg.get("type") or "") != "at":
                continue
            data = seg.get("data") if isinstance(seg.get("data"), dict) else {}
            qq = seg.get("qq") or data.get("qq")
            name = seg.get("name") or data.get("name")
            add(name, qq)

    for item in recent or []:
        if not isinstance(item, dict):
            continue
        uid = item.get("user_id")
        sender = item.get("sender") if isinstance(item.get("sender"), dict) else {}
        add(sender.get("card") or sender.get("nickname"), uid)
        add(sender.get("nickname"), uid)

    for qq in focus_user_ids or []:
        if is_qq_id(qq):
            out[str(qq)] = str(qq)

    if extra:
        for k, v in extra.items():
            add(k, v)
    return out


def sanitize_outgoing(
    text: str | None,
    mention: str | None = None,
    *,
    known: dict[str, str] | None = None,
) -> tuple[str, str | None]:
    raw = text or ""
    mention_out = normalize_mention(mention, known=known)
    found = _CQ_AT.search(raw)
    if found:
        cq_qq = found.group(1)
        cq_name = (found.group(2) or "").strip()
        if not mention_out:
            mention_out = normalize_mention(cq_qq, known=known)
        if cq_name and known is not None and is_qq_id(cq_qq):
            known.setdefault(cq_name, cq_qq)
    cleaned = _CQ_AT.sub("", raw)
    cleaned = _CQ_ANY.sub("", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned).strip(" \t")
    # 最终再拦一次：非数字一律不 @
    mention_out = normalize_mention(mention_out, known=known)
    return cleaned, mention_out
