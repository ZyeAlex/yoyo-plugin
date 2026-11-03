from __future__ import annotations

import logging
import re
from typing import Any

from src.chat.memory.embedder import embed_texts
from src.chat.memory.store import MemoryStore
from src.chat.memory.vector_store import VectorStore, get_vector_store
from src.core.settings import Settings

_logger = logging.getLogger("yoyo.chat.memory.retrieve")

_LATIN = re.compile(r"[A-Za-z0-9_]{3,}")
_CJK_RUN = re.compile(r"[\u4e00-\u9fff]+")


def _keywords(text: str) -> list[str]:
    """Extract searchable tokens: latin words + CJK bigrams/trigrams from runs."""
    raw = text or ""
    out: list[str] = []
    for m in _LATIN.finditer(raw):
        out.append(m.group(0))
    for m in _CJK_RUN.finditer(raw):
        run = m.group(0)
        if len(run) <= 4:
            out.append(run)
        for n in (2, 3):
            for i in range(0, len(run) - n + 1):
                out.append(run[i : i + n])
    # prefer longer unique tokens first when scoring later; keep insertion order unique
    return list(dict.fromkeys(out))[:24]


def keyword_retrieve(
    store: MemoryStore,
    group_id: str,
    query: str,
    *,
    top_k: int = 4,
) -> list[dict[str, Any]]:
    keys = _keywords(query)
    if not keys:
        return []
    candidates: list[tuple[int, str, str]] = []  # score, kind, text

    profile = store.load_group_profile(group_id)
    for ln in profile.splitlines():
        ln = ln.strip()
        if not ln:
            continue
        score = sum(1 for k in keys if k.lower() in ln.lower())
        if score:
            candidates.append((score, "group", ln))

    users = store.load_users(group_id)
    for uid, u in users.items():
        blob_parts = [u.get("nickname") or "", u.get("alias") or ""]
        for lk in ("preferences", "taboos", "notes", "from_others"):
            blob_parts.extend(str(x) for x in (u.get(lk) or []))
        blob = " | ".join(p for p in blob_parts if p)
        score = sum(1 for k in keys if k.lower() in blob.lower())
        if score:
            candidates.append((score, "user", f"用户{uid}: {blob[:200]}"))

    for day, content in store.load_recent_dailies(group_id, days=5):
        for ln in content.splitlines():
            ln = ln.strip().lstrip("- ").strip()
            if not ln:
                continue
            score = sum(1 for k in keys if k.lower() in ln.lower())
            if score:
                candidates.append((score, "daily", f"[{day}] {ln[:200]}"))

    for s in store.load_slang(group_id):
        term = str(s.get("term") or "")
        meaning = str(s.get("meaning") or "")
        blob = f"{term}={meaning}"
        score = sum(1 for k in keys if k.lower() in blob.lower())
        if score:
            candidates.append((score, "slang", blob))

    candidates.sort(key=lambda x: x[0], reverse=True)
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for score, kind, text in candidates:
        if text in seen:
            continue
        seen.add(text)
        out.append({"kind": kind, "text": text, "score": float(score), "source": "keyword"})
        if len(out) >= top_k:
            break
    return out


async def hybrid_retrieve(
    store: MemoryStore,
    settings: Settings,
    group_id: str,
    query: str,
    *,
    top_k: int | None = None,
    vector: VectorStore | None = None,
) -> list[dict[str, Any]]:
    k = top_k or int(settings.chat_retrieve_top_k or 4)
    kw = keyword_retrieve(store, group_id, query, top_k=k)

    if not settings.chat_embedding_enabled:
        return kw

    vec = vector or get_vector_store()
    try:
        embs = await embed_texts(settings, [query[:500]])
    except Exception as e:
        _logger.warning("retrieve embed error: %s", e)
        embs = None
    if not embs:
        return kw

    vec_hits = vec.search(group_id, embs[0], top_k=k)
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    # prefer vector then keyword
    for h in vec_hits:
        t = str(h.get("text") or "")
        if t and t not in seen:
            seen.add(t)
            merged.append(
                {
                    "kind": h.get("kind") or "vec",
                    "text": t,
                    "score": float(h.get("score") or 0),
                    "source": "vector",
                }
            )
    for h in kw:
        t = str(h.get("text") or "")
        if t and t not in seen:
            seen.add(t)
            merged.append(h)
    return merged[:k]


async def index_texts(
    settings: Settings,
    group_id: str,
    items: list[tuple[str, str, str]],
    *,
    vector: VectorStore | None = None,
) -> int:
    """items: (kind, ref_id, text). Returns count indexed."""
    if not settings.chat_embedding_enabled or not items:
        return 0
    texts = [t for _, _, t in items]
    embs = await embed_texts(settings, texts)
    if not embs:
        return 0
    vec = vector or get_vector_store()
    n = 0
    for (kind, ref_id, text), emb in zip(items, embs):
        vec.upsert(group_id, kind, ref_id, text, emb)
        n += 1
    return n
