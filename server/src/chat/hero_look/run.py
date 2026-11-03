from __future__ import annotations

import json
import shutil
import time
from pathlib import Path
from typing import Any, Callable

from src.chat.hero_look.describe import hint_miss, hint_ok, weak_desc
from src.chat.hero_look.index import pick_hero_img
from src.chat.hero_look.paths import looks_media_dir
from src.chat.hero_look.resolve_q import resolve_look_query

DescribeFn = Callable[[Path, str, str], str]  # (copied_path, hero_id, name) -> desc


def stage_look_file(src: str | Path, *, session_id: str, hero_id: str) -> Path:
    dest_dir = looks_media_dir(session_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(src).suffix.lower() or ".png"
    dest = dest_dir / f"{hero_id}{suffix}"
    src_path = Path(src).resolve()
    dest_path = dest.resolve()
    if src_path != dest_path:
        shutil.copy2(src_path, dest_path)
    return dest_path


def _miss(**extra: Any) -> dict[str, Any]:
    return {
        "ok": False,
        "kind": "hero_look",
        "id": "",
        "name": "",
        "desc": "",
        "ref_available": False,
        "hint": hint_miss(),
        **extra,
    }


def run_look(
    op: dict[str, Any],
    *,
    self_hero_id: str,
    session_id: str = "",
    describe: DescribeFn | None = None,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    q = str((op or {}).get("q") or (op or {}).get("query") or "").strip()
    resolved = resolve_look_query(q, self_hero_id=self_hero_id)
    if not resolved:
        return _miss(), None
    hero_id, name = resolved
    src = pick_hero_img(hero_id)
    if not src:
        bad = _miss()
        bad["id"] = hero_id
        bad["name"] = name
        return bad, None
    dest = stage_look_file(src, session_id=session_id, hero_id=hero_id)
    if describe is not None:
        desc = (describe(dest, hero_id, name) or "").strip()[:200]
    else:
        desc = weak_desc(hero_id, name)
    if not desc:
        desc = weak_desc(hero_id, name)
    result = {
        "ok": True,
        "kind": "hero_look",
        "id": hero_id,
        "name": name,
        "desc": desc[:200],
        "ref_available": True,
        "hint": hint_ok(),
    }
    pending = {
        "hero_id": hero_id,
        "name": name,
        "path": str(dest.resolve()),
        "ts": time.time(),
    }
    return result, pending


def format_look_blob(results: list[dict[str, Any]]) -> str:
    lines = [json.dumps(r, ensure_ascii=False) for r in results]
    return "【工具结果】\n" + "\n".join(lines)


def run_looks(
    ops: list[dict[str, Any]],
    *,
    self_hero_id: str,
    session_id: str = "",
    max_ops: int = 1,
    describe: DescribeFn | None = None,
) -> tuple[str, dict[str, Any] | None, list[dict[str, Any]]]:
    limit = max(0, int(max_ops or 0))
    results: list[dict[str, Any]] = []
    pending: dict[str, Any] | None = None
    for op in ops[:limit]:
        if not isinstance(op, dict) or op.get("type") != "look":
            continue
        result, ref = run_look(
            op, self_hero_id=self_hero_id, session_id=session_id, describe=describe
        )
        results.append(result)
        if ref:
            pending = ref
    if not results:
        return "", None, []
    return format_look_blob(results), pending, results
