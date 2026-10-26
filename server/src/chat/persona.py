from __future__ import annotations

from functools import lru_cache
from pathlib import Path

_PROMPTS = Path(__file__).resolve().parents[2] / "prompts" / "persona.md"


@lru_cache
def load_persona() -> str:
    if _PROMPTS.exists():
        return _PROMPTS.read_text(encoding="utf-8").strip()
    return "你是悠悠，QQ 群聊伙伴。用短句 JSON replies 回复。"
