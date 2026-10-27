from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal
from urllib.parse import urlparse

MediaKind = Literal["photo", "sticker", "face", "mface", "link"]

# 常见黄脸 id → 短名；未知 id 仍输出 [黄脸:<id>]
_FACE_NAMES: dict[str, str] = {
    "14": "微笑",
    "0": "惊讶",
    "1": "撇嘴",
    "2": "色",
    "4": "得意",
    "5": "流泪",
    "6": "害羞",
    "12": "调皮",
    "13": "呲牙",
    "21": "可爱",
    "178": "泪奔",
    "182": "笑哭",
    "186": "旺柴",
}

_URL_RE = re.compile(r"https?://[^\s<>\[\]（）()]+", re.I)
_PURE_URL_RE = re.compile(r"^https?://\S+$", re.I)


@dataclass
class MediaRef:
    kind: MediaKind
    url: str = ""
    path: str = ""
    summary: str = ""
    face_id: str = ""
    meta: dict[str, Any] = field(default_factory=dict)


def _as_segs(message: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not message:
        return []
    segs = message.get("message")
    if isinstance(segs, list):
        return [s for s in segs if isinstance(s, dict)]
    return []


def _data(seg: dict[str, Any]) -> dict[str, Any]:
    data = seg.get("data")
    return data if isinstance(data, dict) else {}


def _seg_get(seg: dict[str, Any], *keys: str) -> Any:
    data = _data(seg)
    for key in keys:
        if key in seg and seg[key] not in (None, ""):
            return seg[key]
        if key in data and data[key] not in (None, ""):
            return data[key]
    return None


def _seg_url(seg: dict[str, Any]) -> str:
    raw = _seg_get(seg, "url", "file")
    if raw is None:
        return ""
    return str(raw).strip()


def _is_sticker(seg: dict[str, Any]) -> bool:
    summary = str(_seg_get(seg, "summary") or "")
    if "表情" in summary:
        return True
    sub = _seg_get(seg, "sub_type", "subType")
    return sub not in (None, 0, "0")


def _face_short_name(face_id: str) -> str:
    name = _FACE_NAMES.get(face_id, "")
    if name:
        return f"[黄脸:{name}({face_id})]"
    return f"[黄脸:{face_id}]"


def parse_message_segments(message: dict[str, Any] | None) -> list[MediaRef]:
    refs: list[MediaRef] = []
    for seg in _as_segs(message):
        typ = str(seg.get("type") or "").lower()
        if typ == "image":
            url = _seg_url(seg)
            summary = str(_seg_get(seg, "summary") or "")
            kind: MediaKind = "sticker" if _is_sticker(seg) else "photo"
            refs.append(
                MediaRef(
                    kind=kind,
                    url=url,
                    summary=summary,
                    meta={
                        "sub_type": _seg_get(seg, "sub_type", "subType"),
                        "file": _seg_get(seg, "file"),
                    },
                )
            )
        elif typ == "face":
            face_id = str(_seg_get(seg, "id", "face_id") or "")
            refs.append(
                MediaRef(
                    kind="face",
                    face_id=face_id,
                    summary=_FACE_NAMES.get(face_id, ""),
                    meta={"id": face_id},
                )
            )
        elif typ == "mface":
            face_id = str(_seg_get(seg, "emoji_id", "id", "emojiId") or "")
            summary = str(_seg_get(seg, "summary") or "")
            url = _seg_url(seg)
            # 有可下载 URL → 走表情包货架；无 URL 仅文本占位
            kind: MediaKind = "sticker" if url.strip().startswith(("http://", "https://")) else "mface"
            refs.append(
                MediaRef(
                    kind=kind,
                    url=url,
                    summary=summary,
                    face_id=face_id,
                    meta={"emoji_id": face_id, "from": "mface"},
                )
            )
        elif typ == "text":
            text = str(_seg_get(seg, "text") or "")
            for match in _URL_RE.findall(text):
                url = match.rstrip(".,;:，。；：")
                if _looks_like_url(url):
                    refs.append(MediaRef(kind="link", url=url))
        elif typ in {"share", "json"}:
            url = _seg_url(seg) or str(_seg_get(seg, "jumpUrl", "qqdocurl") or "")
            if url:
                refs.append(MediaRef(kind="link", url=str(url), summary=str(_seg_get(seg, "title") or "")))
    return refs


def _looks_like_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def format_sticker_label(ref: MediaRef, *, tags: dict[str, Any] | None = None) -> str:
    """Short human label for context / transcript. Unlabeled → generic."""
    from src.chat.media.sticker_store import _tags_labeled, short_caption

    tag_dict = tags if isinstance(tags, dict) else None
    if tag_dict is None and isinstance(ref.meta.get("tags"), dict):
        tag_dict = ref.meta["tags"]
    if tag_dict and _tags_labeled(tag_dict):
        cap = short_caption(tag_dict)
        emos = [str(x).strip() for x in (tag_dict.get("emotion") or []) if str(x).strip()][:2]
        if emos:
            return f"[表情包 {cap}｜{','.join(emos)}]"
        return f"[表情包 {cap}]"
    return "[表情包]"


def render_media_placeholders(refs: list[MediaRef]) -> str:
    parts: list[str] = []
    for ref in refs:
        if ref.kind == "photo":
            extra = f" path={ref.path}" if ref.path else ""
            parts.append(f"[图片 url={ref.url}{extra}]")
        elif ref.kind == "sticker":
            parts.append(format_sticker_label(ref))
        elif ref.kind == "link":
            parts.append(f"[链接 {ref.url}]")
        elif ref.kind == "face":
            parts.append(_face_short_name(ref.face_id))
        elif ref.kind == "mface":
            # 有 URL 的 mface 在主线里也按表情包占位（入库见 ingest）
            if (ref.url or "").strip():
                parts.append(format_sticker_label(ref))
            else:
                label = ref.summary or ref.face_id
                parts.append(f"[表情 {label}]")
    return " ".join(parts)


def effective_text(message: dict[str, Any] | None) -> str:
    """仅 text / @ / face 文案；不含纯 url 段，也不用 raw_message / CQ:image。"""
    parts: list[str] = []
    for seg in _as_segs(message):
        typ = str(seg.get("type") or "").lower()
        if typ == "text":
            text = str(_seg_get(seg, "text") or "")
            if _PURE_URL_RE.match(text.strip()):
                continue
            # 去掉夹在文案里的裸 url，避免当有效字
            cleaned = _URL_RE.sub(" ", text)
            if cleaned.strip():
                parts.append(cleaned)
        elif typ == "at":
            qq = _seg_get(seg, "qq", "text")
            parts.append(f"@{qq or ''}")
        elif typ == "face":
            face_id = str(_seg_get(seg, "id", "face_id") or "")
            parts.append(_face_short_name(face_id))
    return "".join(parts).strip()


def has_meaningful_text(message: dict[str, Any] | None) -> bool:
    """策略 C：有效文字来自用户正文，@ / face / 纯链 / 标点不算。"""
    chunks: list[str] = []
    for seg in _as_segs(message):
        if str(seg.get("type") or "").lower() != "text":
            continue
        text = str(_seg_get(seg, "text") or "")
        if _PURE_URL_RE.match(text.strip()):
            continue
        cleaned = _URL_RE.sub(" ", text)
        if cleaned.strip():
            chunks.append(cleaned)
    body = "".join(chunks).strip()
    if len(body) < 1:
        return False
    return any(ch.isalnum() for ch in body)
