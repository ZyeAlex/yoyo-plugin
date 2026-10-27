"""群聊逐条可读记录。没回复的句子也落盘，重启后仍能塞进上下文。"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

from src.chat.media.segments import (
    _as_segs,
    _face_short_name,
    _seg_get,
    format_sticker_label,
    parse_message_segments,
)
from src.chat.memory.paths import group_dir

_CQ_AT = re.compile(r"\[CQ:at,qq=(\d+)(?:,name=([^,\]]*))?[^\]]*\]", re.I)
_CQ_IMAGE = re.compile(r"\[CQ:image[^\]]*\]", re.I)
_CQ_FACE = re.compile(r"\[CQ:(?:face|mface)[^\]]*\]", re.I)
_CQ_ANY = re.compile(r"\[CQ:[^\]]+\]", re.I)
_MAX_KEEP = 400


def render_cq_string(raw: str) -> str:
    """把 CQ 码换成可读片段。"""
    text = _CQ_AT.sub(lambda m: f"@{m.group(2).strip()}" if (m.group(2) or "").strip() else f"@{m.group(1)}", raw or "")
    text = _CQ_IMAGE.sub("[图片]", text)
    text = _CQ_FACE.sub("[表情]", text)
    text = _CQ_ANY.sub("", text)
    return re.sub(r"\s+", " ", text).strip()


def speaker_name(message: dict[str, Any] | None) -> str:
    message = message or {}
    sender = message.get("sender") or {}
    if isinstance(sender, dict):
        name = sender.get("card") or sender.get("nickname") or message.get("user_id") or "?"
        return str(name)
    return str(message.get("user_id") or "?")


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
    return re.sub(r"[ \t]+", " ", "".join(parts)).strip()


def transcript_line(message: dict[str, Any] | None) -> str:
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
    if not text:
        return ""
    return f"{speaker_name(message)}: {text}"


def transcript_path(group_id: str):
    return group_dir(group_id) / "transcript.jsonl"


def append_transcript(group_id: str, line: str, *, max_keep: int = _MAX_KEEP) -> None:
    text = (line or "").strip()
    if not text or not group_id:
        return
    path = transcript_path(group_id)
    row = {
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "line": text[:500],
    }
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    _trim(path, max_keep)


def load_transcript_lines(group_id: str, *, max_lines: int = 30, max_chars: int = 1500) -> list[str]:
    if not group_id:
        return []
    path = transcript_path(group_id)
    if not path.exists():
        return []
    lines: list[str] = []
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
        line = str((data or {}).get("line") or "").strip()
        if line:
            lines.append(line)
    tail = lines[-max(1, max_lines) :]
    while len(tail) > 1 and sum(len(x) + 1 for x in tail) > max_chars:
        tail.pop(0)
    return tail


def _trim(path, max_keep: int) -> None:
    try:
        rows = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    if len(rows) <= max_keep:
        return
    path.write_text("\n".join(rows[-max_keep:]) + "\n", encoding="utf-8")
