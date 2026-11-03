from __future__ import annotations

import json
import math
import sqlite3
import threading
from pathlib import Path
from typing import Any

from src.chat.memory import paths


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return -1.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0 or nb <= 0:
        return -1.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


class VectorStore:
    def __init__(self, db_path: Path | None = None) -> None:
        self._path = Path(db_path) if db_path else paths.vector_db_path()
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
                    CREATE TABLE IF NOT EXISTS embeddings (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        group_id TEXT NOT NULL,
                        kind TEXT NOT NULL,
                        ref_id TEXT NOT NULL,
                        text TEXT NOT NULL,
                        embedding BLOB NOT NULL,
                        created_at TEXT NOT NULL DEFAULT (datetime('now'))
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_emb_group ON embeddings(group_id)"
                )
                conn.commit()
            finally:
                conn.close()

    @staticmethod
    def _pack(vec: list[float]) -> bytes:
        return json.dumps(vec).encode("utf-8")

    @staticmethod
    def _unpack(blob: bytes) -> list[float]:
        return [float(x) for x in json.loads(blob.decode("utf-8"))]

    def upsert(
        self,
        group_id: str,
        kind: str,
        ref_id: str,
        text: str,
        embedding: list[float],
    ) -> None:
        if not embedding or not (text or "").strip():
            return
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    "DELETE FROM embeddings WHERE group_id=? AND kind=? AND ref_id=?",
                    (str(group_id), str(kind), str(ref_id)),
                )
                conn.execute(
                    "INSERT INTO embeddings(group_id, kind, ref_id, text, embedding) VALUES (?,?,?,?,?)",
                    (str(group_id), str(kind), str(ref_id), text[:2000], self._pack(embedding)),
                )
                conn.commit()
            finally:
                conn.close()

    def search(
        self,
        group_id: str,
        query_embedding: list[float],
        *,
        top_k: int = 4,
    ) -> list[dict[str, Any]]:
        if not query_embedding:
            return []
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    "SELECT id, kind, ref_id, text, embedding FROM embeddings WHERE group_id=?",
                    (str(group_id),),
                ).fetchall()
            finally:
                conn.close()
        scored: list[tuple[float, dict[str, Any]]] = []
        for row in rows:
            try:
                emb = self._unpack(row["embedding"])
            except Exception:
                continue
            score = _cosine(query_embedding, emb)
            if score < 0.15:
                continue
            scored.append(
                (
                    score,
                    {
                        "id": row["id"],
                        "kind": row["kind"],
                        "ref_id": row["ref_id"],
                        "text": row["text"],
                        "score": score,
                    },
                )
            )
        scored.sort(key=lambda x: x[0], reverse=True)
        return [x[1] for x in scored[: max(1, top_k)]]

    def clear_group(self, group_id: str) -> int:
        with self._lock:
            conn = self._connect()
            try:
                cur = conn.execute("DELETE FROM embeddings WHERE group_id=?", (str(group_id),))
                conn.commit()
                return cur.rowcount or 0
            finally:
                conn.close()


_VEC: VectorStore | None = None


def get_vector_store(db_path: Path | None = None) -> VectorStore:
    global _VEC
    if db_path is not None:
        return VectorStore(db_path)
    if _VEC is None:
        _VEC = VectorStore()
    return _VEC
