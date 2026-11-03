from __future__ import annotations

import re
from typing import Any

from src.chat.memory.store import MemoryStore


def match_slang(
    store: MemoryStore,
    group_id: str,
    text: str,
    *,
    max_hits: int = 8,
) -> list[dict[str, Any]]:
    """Scan text for known slang terms; longest-term first."""
    items = store.load_slang(group_id)
    if not items or not (text or "").strip():
        return []
    ranked = sorted(items, key=lambda x: len(str(x.get("term") or "")), reverse=True)
    hits: list[dict[str, Any]] = []
    lower = text.lower()
    used_spans: list[tuple[int, int]] = []
    for it in ranked:
        term = str(it.get("term") or "").strip()
        if not term or len(term) < 2:
            continue
        idx = lower.find(term.lower())
        if idx < 0:
            continue
        end = idx + len(term)
        if any(not (end <= a or idx >= b) for a, b in used_spans):
            continue
        used_spans.append((idx, end))
        hits.append(it)
        if len(hits) >= max_hits:
            break
    if hits:
        store.bump_slang_hits(group_id, [str(h.get("term")) for h in hits])
    return hits


_MEANING_Q = re.compile(
    r"[「『\"']?(.{1,20}?)[」』\"']?\s*(是什么意思|啥意思|什么梗|啥梗|是啥意思)",
)


def detect_slang_question(text: str) -> str | None:
    m = _MEANING_Q.search(text or "")
    if not m:
        return None
    term = (m.group(1) or "").strip(" ？?。.!！")
    return term if len(term) >= 2 else None


def format_slang_block(hits: list[dict[str, Any]]) -> str:
    if not hits:
        return ""
    lines = ["【群黑话】"]
    for h in hits:
        lines.append(f"- {h.get('term')}={h.get('meaning')}")
    return "\n".join(lines)
