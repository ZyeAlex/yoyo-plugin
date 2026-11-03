"""开发期决策追踪。调试结束后按 docs/11-debug-trace-remove.md 整文件删除。"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from src.chat.memory.paths import group_dir

_MAX_LINES = 400
_STR_LIMIT = 8000


def trace_path(group_id: str):
    return group_dir(group_id) / "trace.jsonl"


def shrink(value: Any, *, limit: int = _STR_LIMIT) -> Any:
    """去掉 base64 图，长文本截断，避免把整段图片写进日志。"""
    if isinstance(value, str):
        if value.startswith("data:"):
            return f"[data {len(value)} chars]"
        if len(value) <= limit:
            return value
        return value[:limit] + f"…(+{len(value) - limit})"
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            if key in {"url", "image_url"} and isinstance(item, str) and (
                item.startswith("data:") or len(item) > 500
            ):
                out[key] = f"[omitted {len(item)} chars]"
                continue
            if key == "image_url" and isinstance(item, dict):
                url = str(item.get("url") or "")
                out[key] = {"url": url if len(url) <= 500 and not url.startswith("data:") else f"[omitted {len(url)} chars]"}
                continue
            out[key] = shrink(item, limit=limit)
        return out
    if isinstance(value, list):
        return [shrink(item, limit=limit) for item in value]
    return value


def append_trace(group_id: str, event: dict[str, Any], *, max_lines: int = _MAX_LINES) -> None:
    if not group_id or not isinstance(event, dict):
        return
    path = trace_path(group_id)
    row = {"ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), **shrink(event)}
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    _trim(path, max_lines)


def load_trace(group_id: str, *, max_lines: int = 50) -> list[dict[str, Any]]:
    path = trace_path(group_id)
    if not path.exists():
        return []
    try:
        rows = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    out: list[dict[str, Any]] = []
    for row in rows[-max_lines:]:
        row = row.strip()
        if not row:
            continue
        try:
            data = json.loads(row)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict):
            out.append(data)
    return out


def _trim(path, max_lines: int) -> None:
    try:
        rows = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    if len(rows) <= max_lines:
        return
    path.write_text("\n".join(rows[-max_lines:]) + "\n", encoding="utf-8")
