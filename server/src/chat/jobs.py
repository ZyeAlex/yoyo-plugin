from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any, Awaitable, Callable

_logger = logging.getLogger("yoyo.chat.jobs")

OnDone = Callable[[str, dict[str, Any]], Awaitable[None]]


async def run_mock_draw(
    *,
    job_id: str,
    prompt: str,
    delay_sec: float = 3.0,
    on_done: OnDone | None = None,
) -> None:
    """异步假画画：延迟后回调 tool_done（后续可换成真实绘图 API）。"""
    try:
        await asyncio.sleep(max(0.5, delay_sec))
        result = {
            "ok": True,
            "kind": "image",
            # 占位：真实实现可改为本地路径 / URL
            "caption": f"（模拟画作）{prompt[:40]}",
            "path": None,
        }
        if on_done:
            await on_done(job_id, result)
    except asyncio.CancelledError:
        _logger.info("draw job cancelled id=%s", job_id)
        raise
    except Exception as err:
        _logger.exception("draw job failed id=%s", job_id)
        if on_done:
            await on_done(job_id, {"ok": False, "error": str(err)})


def new_job_id() -> str:
    return uuid.uuid4().hex[:12]
