from __future__ import annotations

import json
import logging
import re
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

_logger = logging.getLogger("yoyo.chat.media.sticker_store")

_SERVER_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_INDEX = _SERVER_ROOT / "data" / "stickers" / "index.sqlite"
_UNLABELED_OCR = "__unlabeled__"
RECENT_USED = timedelta(minutes=10)
_SPLIT = re.compile(r"[\s,，、;；|/]+")
_CJK = re.compile(r"[\u4e00-\u9fff]")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_ts(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        t = datetime.fromisoformat(str(raw))
    except ValueError:
        return None
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return t


def _is_cjk(text: str) -> bool:
    return bool(_CJK.search(text))


def tokens(query: str) -> list[str]:
    q = (query or "").strip().lower()
    if not q:
        return []
    parts = [p for p in _SPLIT.split(q) if p]
    out: list[str] = []
    seen: set[str] = set()
    for part in parts:
        if part not in seen:
            seen.add(part)
            out.append(part)
        if _is_cjk(part) and len(part) >= 2:
            for i in range(len(part) - 1):
                gram = part[i : i + 2]
                if gram not in seen:
                    seen.add(gram)
                    out.append(gram)
    return out


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return " ".join(str(x) for x in value if x is not None).lower()
    return str(value).lower()


def _sticker_files_root() -> Path:
    return _SERVER_ROOT / "data" / "stickers" / "files"


def is_unlabeled_stub(tags: dict[str, Any] | None) -> bool:
    """VLM failure rows: failed flag or the __unlabeled__ OCR sentinel."""
    if not isinstance(tags, dict):
        return False
    if tags.get("failed") is True:
        return True
    ocr = tags.get("ocr_text")
    return isinstance(ocr, str) and ocr.strip() == _UNLABELED_OCR


def _tags_labeled(tags: dict[str, Any]) -> bool:
    if not isinstance(tags, dict) or is_unlabeled_stub(tags):
        return False
    for key in ("emotion", "aliases", "scene", "ocr_text", "usable_for"):
        val = tags.get(key)
        if isinstance(val, list) and any(str(x).strip() for x in val):
            return True
        if isinstance(val, str) and val.strip() and val.strip() != _UNLABELED_OCR:
            return True
    return False


def score_tags(query: str, tags: dict[str, Any]) -> float:
    toks = tokens(query)
    if not toks:
        return 0.0
    fields = (
        (_as_text(tags.get("emotion")), 3.0),
        (_as_text(tags.get("aliases")), 3.0),
        (_as_text(tags.get("ocr_text")), 2.0),
        (_as_text(tags.get("scene")), 2.0),
    )
    score = 0.0
    for tok in toks:
        for hay, weight in fields:
            if tok and tok in hay:
                score += weight
    return score


def short_caption(tags: dict[str, Any] | None) -> str:
    """Human-readable short name for shelf / transcript labels."""
    tags = tags if isinstance(tags, dict) else {}
    ocr = str(tags.get("ocr_text") or "").strip()
    if ocr and ocr != _UNLABELED_OCR:
        return ocr[:24]
    for key in ("aliases", "emotion"):
        val = tags.get(key)
        if isinstance(val, list):
            for item in val:
                s = str(item).strip()
                if s:
                    return s[:24]
        elif isinstance(val, str) and val.strip():
            return val.strip()[:24]
    return "表情"


class StickerStore:
    def __init__(self, index_path: Path | None = None, *, cap: int = 120) -> None:
        self._path = Path(index_path) if index_path else DEFAULT_INDEX
        self._cap = max(1, int(cap or 120))
        self._lock = threading.RLock()
        self._ensure()

    def _connect(self) -> sqlite3.Connection:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self._path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure(self) -> None:
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS stickers (
                        hash TEXT PRIMARY KEY,
                        path TEXT NOT NULL,
                        tags_json TEXT NOT NULL DEFAULT '{}',
                        hits INTEGER NOT NULL DEFAULT 0,
                        last_used_at TEXT,
                        created_at TEXT NOT NULL
                    )
                    """
                )
                conn.commit()
            finally:
                conn.close()

    def set_cap(self, cap: int) -> None:
        with self._lock:
            self._cap = max(1, int(cap or 1))

    def upsert(self, hash: str, path: str, tags: dict, *, cap: int | None = None) -> None:
        digest = str(hash or "").strip()
        if not digest:
            return
        now = _now_iso()
        tag_dict = tags if isinstance(tags, dict) else {}
        payload = json.dumps(tag_dict, ensure_ascii=False)
        stub = is_unlabeled_stub(tag_dict)
        with self._lock:
            if cap is not None:
                try:
                    self._cap = max(1, int(cap))
                except (TypeError, ValueError):
                    pass
            conn = self._connect()
            try:
                row = conn.execute("SELECT hits FROM stickers WHERE hash = ?", (digest,)).fetchone()
                if row:
                    if stub:
                        conn.execute(
                            """
                            UPDATE stickers
                            SET path = ?, tags_json = ?
                            WHERE hash = ?
                            """,
                            (str(path), payload, digest),
                        )
                    else:
                        conn.execute(
                            """
                            UPDATE stickers
                            SET path = ?, tags_json = ?, hits = hits + 1
                            WHERE hash = ?
                            """,
                            (str(path), payload, digest),
                        )
                else:
                    conn.execute(
                        """
                        INSERT INTO stickers (hash, path, tags_json, hits, last_used_at, created_at)
                        VALUES (?, ?, ?, ?, NULL, ?)
                        """,
                        (digest, str(path), payload, 0 if stub else 1, now),
                    )
                conn.commit()
                removed = self._evict(conn)
                conn.commit()
                for removed_path in removed:
                    self._unlink_evicted_file(conn, removed_path)
            finally:
                conn.close()

    def _evict(self, conn: sqlite3.Connection) -> list[str]:
        count = conn.execute("SELECT COUNT(*) AS n FROM stickers").fetchone()["n"]
        extra = int(count) - self._cap
        if extra <= 0:
            return []
        # Keep high hits and newer created_at; drop the rest.
        rows = conn.execute(
            "SELECT hash, path, hits, created_at FROM stickers ORDER BY hits ASC, created_at ASC"
        ).fetchall()
        removed: list[str] = []
        for row in rows[:extra]:
            conn.execute("DELETE FROM stickers WHERE hash = ?", (row["hash"],))
            removed.append(str(row["path"] or ""))
            _logger.debug("evicted sticker hash=%s", row["hash"])
        return removed

    def _unlink_evicted_file(self, conn: sqlite3.Connection, path: str) -> None:
        raw = str(path or "").strip()
        if not raw:
            return
        try:
            resolved = Path(raw).expanduser().resolve(strict=False)
            root = _sticker_files_root().resolve(strict=False)
            if resolved == root:
                return
            resolved.relative_to(root)
        except (OSError, ValueError):
            return
        if not resolved.is_file():
            return
        for other in conn.execute("SELECT path FROM stickers").fetchall():
            try:
                other_path = Path(str(other["path"] or "")).expanduser().resolve(strict=False)
            except OSError:
                continue
            if other_path == resolved:
                return
        try:
            resolved.unlink()
        except OSError:
            _logger.debug("evict unlink failed path=%s", resolved, exc_info=True)

    def get(self, hash: str) -> dict[str, Any] | None:
        digest = str(hash or "").strip()
        if not digest:
            return None
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute("SELECT * FROM stickers WHERE hash = ?", (digest,)).fetchone()
            finally:
                conn.close()
        if row is None:
            return None
        return self._row_to_dict(row)

    def has_labeled(self, hash: str) -> bool:
        row = self.get(hash)
        if not row:
            return False
        return _tags_labeled(row.get("tags") or {})

    def delete(self, hash: str) -> None:
        """Remove index row and unlink file under data/stickers/files if unused."""
        digest = str(hash or "").strip()
        if not digest:
            return
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT path FROM stickers WHERE hash = ?", (digest,)
                ).fetchone()
                if row is None:
                    return
                path = str(row["path"] or "")
                conn.execute("DELETE FROM stickers WHERE hash = ?", (digest,))
                conn.commit()
                self._unlink_evicted_file(conn, path)
            finally:
                conn.close()

    def purge_unlabeled(self) -> int:
        """Delete all stub / failed rows and their files. Returns removed count."""
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute("SELECT hash, path, tags_json FROM stickers").fetchall()
                removed = 0
                for row in rows:
                    try:
                        tags = json.loads(row["tags_json"] or "{}")
                    except json.JSONDecodeError:
                        tags = {}
                    if not is_unlabeled_stub(tags if isinstance(tags, dict) else {}):
                        continue
                    path = str(row["path"] or "")
                    conn.execute("DELETE FROM stickers WHERE hash = ?", (row["hash"],))
                    removed += 1
                    self._unlink_evicted_file(conn, path)
                conn.commit()
                return removed
            finally:
                conn.close()

    def mark_used(self, hash: str) -> None:
        digest = str(hash or "").strip()
        if not digest:
            return
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    "UPDATE stickers SET last_used_at = ? WHERE hash = ?",
                    (_now_iso(), digest),
                )
                conn.commit()
            finally:
                conn.close()

    def search(self, query: str, *, limit: int = 5) -> list[dict]:
        limit = max(1, int(limit or 5))
        now = datetime.now(timezone.utc)
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute("SELECT * FROM stickers").fetchall()
            finally:
                conn.close()
        scored: list[tuple[float, dict[str, Any]]] = []
        for row in rows:
            item = self._row_to_dict(row)
            tags = item.get("tags") or {}
            if not _tags_labeled(tags):
                continue
            s = score_tags(query, tags)
            if s <= 0:
                continue
            used = _parse_ts(item.get("last_used_at"))
            if used is not None and now - used < RECENT_USED:
                s *= 0.15
            scored.append((s, item))
        scored.sort(key=lambda pair: (-pair[0], -int(pair[1].get("hits") or 0)))
        out = []
        for s, item in scored[:limit]:
            item["score"] = s
            out.append(item)
        return out

    def shelf(
        self,
        *,
        limit: int = 5,
        exclude_hashes: set[str] | None = None,
    ) -> list[dict]:
        """Labeled inventory for prompt candidates (no keyword filter)."""
        limit = max(1, int(limit or 5))
        skip = {str(h).strip() for h in (exclude_hashes or set()) if str(h).strip()}
        now = datetime.now(timezone.utc)
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute("SELECT * FROM stickers").fetchall()
            finally:
                conn.close()
        ranked: list[tuple[float, dict[str, Any]]] = []
        for row in rows:
            item = self._row_to_dict(row)
            digest = str(item.get("hash") or "")
            if digest in skip:
                continue
            tags = item.get("tags") or {}
            if not _tags_labeled(tags):
                continue
            s = 2.0 + min(8.0, float(item.get("hits") or 0) * 0.1)
            used = _parse_ts(item.get("last_used_at"))
            if used is not None and now - used < RECENT_USED:
                s *= 0.15
            item["score"] = s
            item["caption"] = short_caption(tags)
            ranked.append((s, item))
        ranked.sort(key=lambda pair: (-pair[0], -int(pair[1].get("hits") or 0)))
        return [item for _, item in ranked[:limit]]

    def pick_any(self, *, limit: int = 5) -> list[dict]:
        """Alias of shelf() for callers that still use pick_any."""
        return self.shelf(limit=limit)

    @staticmethod
    def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
        try:
            tags = json.loads(row["tags_json"] or "{}")
        except json.JSONDecodeError:
            tags = {}
        if not isinstance(tags, dict):
            tags = {}
        return {
            "hash": row["hash"],
            "path": row["path"],
            "tags": tags,
            "hits": int(row["hits"] or 0),
            "last_used_at": row["last_used_at"],
            "created_at": row["created_at"],
        }


_default: StickerStore | None = None
_default_lock = threading.Lock()


def default_store(settings=None) -> StickerStore:
    global _default
    cap = 120
    if settings is not None:
        cap = int(getattr(settings, "chat_sticker_library_cap", 120) or 120)
    with _default_lock:
        if _default is None:
            _default = StickerStore(DEFAULT_INDEX, cap=cap)
        elif settings is not None:
            _default.set_cap(cap)
        return _default
