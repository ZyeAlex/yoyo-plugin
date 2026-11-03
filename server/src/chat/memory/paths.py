from __future__ import annotations

from pathlib import Path

# server/src/chat/memory/paths.py → server/
_SERVER_ROOT = Path(__file__).resolve().parents[3]
MEMORY_ROOT = _SERVER_ROOT / "data" / "memory"


def memory_root() -> Path:
    MEMORY_ROOT.mkdir(parents=True, exist_ok=True)
    return MEMORY_ROOT


def global_memory_path() -> Path:
    p = memory_root() / "global"
    p.mkdir(parents=True, exist_ok=True)
    return p / "MEMORY.md"


def group_dir(group_id: str) -> Path:
    gid = str(group_id or "unknown").strip() or "unknown"
    p = memory_root() / "group" / gid
    p.mkdir(parents=True, exist_ok=True)
    (p / "logs").mkdir(parents=True, exist_ok=True)
    (p / "index").mkdir(parents=True, exist_ok=True)
    return p


def group_memory_path(group_id: str) -> Path:
    return group_dir(group_id) / "MEMORY.md"


def users_path(group_id: str) -> Path:
    return group_dir(group_id) / "users.yaml"


def slang_path(group_id: str) -> Path:
    return group_dir(group_id) / "slang.yaml"


def session_path(group_id: str) -> Path:
    return group_dir(group_id) / "session.jsonl"


def daily_log_path(group_id: str, day: str) -> Path:
    """day: YYYY-MM-DD"""
    return group_dir(group_id) / "logs" / f"{day}.md"


def vector_db_path() -> Path:
    p = memory_root() / "index"
    p.mkdir(parents=True, exist_ok=True)
    return p / "memory.vec.db"
