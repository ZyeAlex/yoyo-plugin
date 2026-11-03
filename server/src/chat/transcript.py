"""群聊逐条可读记录。没回复的句子也落盘，重启后仍能塞进上下文。"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from src.chat.media.segments import (
    _as_segs,
    _face_short_name,
    _seg_get,
    format_sticker_label,
    parse_message_segments,
)
from src.chat.memory.paths import group_dir
from src.chat.speakers import (
    display_nickname,
    format_bot_line,
    format_message_line,
    is_bot_speaker_line,
    sender_qq,
    sender_role,
)

_CQ_AT = re.compile(r"\[CQ:at,qq=(\d+)(?:,name=([^,\]]*))?[^\]]*\]", re.I)
_CQ_IMAGE = re.compile(r"\[CQ:image[^\]]*\]", re.I)
_CQ_FACE = re.compile(r"\[CQ:(?:face|mface)[^\]]*\]", re.I)
_CQ_FORWARD = re.compile(r"\[CQ:forward[^\]]*\]", re.I)
_CQ_ANY = re.compile(r"\[CQ:[^\]]+\]", re.I)
_MAX_KEEP = 400
_SHANGHAI = ZoneInfo("Asia/Shanghai")
_WEEKDAYS = "一二三四五六日"
_STAMP_RE = re.compile(r"^\[\d{2}-\d{2} \d{2}:\d{2}\] ")


def render_cq_string(raw: str) -> str:
    """把 CQ 码换成可读片段。"""
    text = _CQ_AT.sub(lambda m: f"@{m.group(2).strip()}" if (m.group(2) or "").strip() else f"@{m.group(1)}", raw or "")
    text = _CQ_IMAGE.sub("[图片]", text)
    text = _CQ_FACE.sub("[表情]", text)
    text = _CQ_FORWARD.sub("[转发的聊天记录]", text)
    text = _CQ_ANY.sub("", text)
    # 转发展开后是多行「昵称: 正文」，保留换行；其它 CQ 清洗仍压空白
    if "\n" in text and "[转发的聊天记录]" in text:
        lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.splitlines()]
        return "\n".join(ln for ln in lines if ln).strip()
    return re.sub(r"\s+", " ", text).strip()


def speaker_name(message: dict[str, Any] | None) -> str:
    return display_nickname(message)


def visible_text(message: dict[str, Any] | None) -> str:
    """正文和 @，不含图片 URL，也不保留 CQ。"""
    message = message or {}
    segs = _as_segs(message)
    if not segs:
        return render_cq_string(str(message.get("raw_message") or ""))
    parts: list[str] = []
    for seg in segs:
        typ = str(seg.get("type") or "").lower()
        if typ == "text":
            parts.append(str(_seg_get(seg, "text") or ""))
        elif typ == "at":
            name = str(_seg_get(seg, "name") or "").strip()
            qq = str(_seg_get(seg, "qq") or "").strip()
            if name:
                parts.append(f"@{name}")
            elif qq:
                parts.append(f"@{qq}")
        elif typ == "face":
            parts.append(_face_short_name(str(_seg_get(seg, "id", "face_id") or "")))
        elif typ in {"forward", "xml"}:
            # 插件侧应已展开为 text；若仍是裸 forward，至少占位
            parts.append("[转发的聊天记录]")
    body = "".join(parts)
    if "\n" in body and "[转发的聊天记录]" in body:
        lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in body.splitlines()]
        return "\n".join(ln for ln in lines if ln).strip()
    return re.sub(r"[ \t]+", " ", body).strip()


def _body_with_tags(message: dict[str, Any] | None) -> str:
    message = message or {}
    body = visible_text(message)
    refs = parse_message_segments(message)
    tags: list[str] = []
    if any(r.kind == "photo" for r in refs) and "[图片]" not in body:
        tags.append("[图片]")
    sticker_refs = [r for r in refs if r.kind == "sticker" or (r.kind == "mface" and (r.url or "").strip())]
    if sticker_refs and "[表情" not in body:
        tags.append(format_sticker_label(sticker_refs[0]))
    if any(r.kind == "link" for r in refs) and "[链接]" not in body:
        tags.append("[链接]")
    text = f"{body} {' '.join(tags)}".strip() if tags else body
    if not text:
        text = render_cq_string(str(message.get("raw_message") or ""))
    return text


def transcript_line(message: dict[str, Any] | None) -> str:
    text = _body_with_tags(message)
    if not text:
        return ""
    return format_message_line(message, text)


def bot_transcript_line(
    body: str,
    *,
    bot_id: str,
    bot_nickname: str = "悠悠",
    role: str = "member",
) -> str:
    return format_bot_line(body, bot_id=bot_id, bot_nickname=bot_nickname, role=role)


def coerce_datetime(value: Any) -> datetime | None:
    """Unix 秒/毫秒或 ISO 时间，统一成北京时间。"""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, (int, float)):
        sec = float(value)
        if sec > 1e12:
            sec /= 1000.0
        if sec <= 0:
            return None
        return datetime.fromtimestamp(sec, _SHANGHAI)
    else:
        text = str(value).strip()
        if not text:
            return None
        if re.fullmatch(r"\d+(?:\.\d+)?", text):
            return coerce_datetime(float(text))
        try:
            dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=_SHANGHAI)
    return dt.astimezone(_SHANGHAI)


def format_now(when: Any = None) -> str:
    dt = coerce_datetime(when) or datetime.now(_SHANGHAI)
    return f"{dt:%Y-%m-%d %H:%M} 周{_WEEKDAYS[dt.weekday()]}"


def stamp_line(line: str, when: Any = None, *, fallback_now: bool = False) -> str:
    text = (line or "").strip()
    if not text:
        return ""
    dt = coerce_datetime(when)
    if dt is None and fallback_now:
        dt = datetime.now(_SHANGHAI)
    if dt is None:
        return text
    return f"[{dt:%m-%d %H:%M}] {text}"


def unstamp_line(line: str) -> str:
    return _STAMP_RE.sub("", (line or "").strip(), count=1)


def transcript_path(group_id: str):
    return group_dir(group_id) / "transcript.jsonl"


def append_transcript(
    group_id: str,
    line: str,
    *,
    max_keep: int = _MAX_KEEP,
    user_id: str = "",
    nickname: str = "",
    role: str = "",
    is_bot: bool = False,
    when: Any = None,
) -> None:
    text = (line or "").strip()
    if not text or not group_id:
        return
    path = transcript_path(group_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    ts = coerce_datetime(when)
    row: dict[str, Any] = {
        "ts": (ts or datetime.now(timezone.utc)).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        if ts
        else datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "line": text[:500],
    }
    if user_id:
        row["user_id"] = str(user_id)
    if nickname:
        row["nickname"] = str(nickname)[:64]
    if role:
        row["role"] = str(role)
    if is_bot:
        row["is_bot"] = True
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    _trim(path, max_keep)


def _read_rows(group_id: str) -> list[tuple[str, str, dict[str, Any]]]:
    """(存储的 ts, 不带时间的 line, meta)。"""
    if not group_id:
        return []
    path = transcript_path(group_id)
    if not path.exists():
        return []
    rows: list[tuple[str, str, dict[str, Any]]] = []
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return []
    for row in raw.splitlines():
        row = row.strip()
        if not row:
            continue
        try:
            data = json.loads(row)
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        line = str(data.get("line") or "").strip()
        if not line:
            continue
        meta = {
            k: data[k]
            for k in ("user_id", "nickname", "role", "is_bot")
            if k in data
        }
        rows.append((str(data.get("ts") or ""), line, meta))
    return rows


def _present(
    rows: list[tuple[str, str, dict[str, Any]]],
    *,
    max_lines: int,
    max_chars: int,
    with_time: bool,
) -> list[str]:
    if not rows:
        return []
    tail = rows[-max(1, max_lines) :]
    lines = [stamp_line(line, ts) if with_time else line for ts, line, _meta in tail]
    while len(lines) > 1 and sum(len(x) + 1 for x in lines) > max_chars:
        lines.pop(0)
    return lines


def load_transcript_lines(
    group_id: str,
    *,
    max_lines: int = 60,
    max_chars: int = 3500,
    with_time: bool = False,
) -> list[str]:
    """默认窗口加大：离场攒话再进场时不至于只看见最后几句。"""
    return _present(
        _read_rows(group_id),
        max_lines=max_lines,
        max_chars=max_chars,
        with_time=with_time,
    )


def load_transcript_since_bot(
    group_id: str,
    *,
    max_lines: int = 100,
    max_chars: int = 5000,
    keep_before: int = 8,
    with_time: bool = False,
    bot_id: str = "",
    bot_nickname: str = "悠悠",
) -> list[str]:
    """优先注入「悠悠上次开口之后」的未读群聊，再保留一点开口前上下文。

    盘上仍有完整 transcript；这里只解决进场时上下文被截断的问题。
    `with_time=True` 时每行前加北京时间 `[月-日 时:分]`。没有 ts 的旧行不加。
    """
    rows = _read_rows(group_id)
    if not rows:
        return []
    last_bot = -1
    for i, (_ts, line, meta) in enumerate(rows):
        if meta.get("is_bot") or is_bot_speaker_line(
            line, bot_id=bot_id, bot_nickname=bot_nickname
        ):
            last_bot = i
    if last_bot < 0:
        window = rows
    else:
        start = max(0, last_bot - max(0, keep_before))
        window = rows[start:]
    return _present(window, max_lines=max_lines, max_chars=max_chars, with_time=with_time)


def cast_ids_from_transcript(
    group_id: str,
    *,
    max_lines: int = 40,
) -> list[str]:
    """从近期落盘记录里抽 QQ，供出场人物补全。"""
    out: list[str] = []
    seen: set[str] = set()
    for _ts, _line, meta in _read_rows(group_id)[-max(1, max_lines) :]:
        uid = str(meta.get("user_id") or "").strip()
        if uid and uid not in seen:
            seen.add(uid)
            out.append(uid)
    return out


def message_meta(message: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "user_id": sender_qq(message),
        "nickname": display_nickname(message),
        "role": sender_role(message),
        "is_bot": False,
    }


def _trim(path, max_keep: int) -> None:
    try:
        rows = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    if len(rows) <= max_keep:
        return
    path.write_text("\n".join(rows[-max_keep:]) + "\n", encoding="utf-8")
