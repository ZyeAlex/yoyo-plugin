from __future__ import annotations

import logging
from datetime import date, timedelta

from src.chat.memory.store import MemoryStore, get_memory_store

_logger = logging.getLogger("yoyo.chat.memory.scheduler")


def ensure_yesterday_stub(store: MemoryStore | None = None, group_ids: list[str] | None = None) -> None:
    """Lightweight: if yesterday log exists without a summary header, leave as-is.
    Placeholder for future day-end summarizer; currently no-op beyond logging.
    """
    store = store or get_memory_store()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    for gid in group_ids or []:
        text = store.load_daily(gid, yesterday)
        if text:
            _logger.debug("group %s has yesterday log (%d chars)", gid, len(text))
