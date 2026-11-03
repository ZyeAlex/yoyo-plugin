from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from src.chat.game_kb.paths import game_data_root

_cache: dict[str, tuple[float, Any]] = {}


def load_yaml(stem: str) -> Any:
    """stem: 'hero' | 'pet' | 'lore/promilia' etc."""
    path = game_data_root() / f"{stem}.yaml"
    if not path.is_file():
        return None
    mtime = path.stat().st_mtime
    hit = _cache.get(str(path))
    if hit and hit[0] == mtime:
        return hit[1]
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    _cache[str(path)] = (mtime, data)
    return data


def clear_loader_cache_for_tests() -> None:
    _cache.clear()
