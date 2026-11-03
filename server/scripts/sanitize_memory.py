#!/usr/bin/env python3
"""全量清洗 data/memory/group/*/users.yaml 与 MEMORY.md。"""

from __future__ import annotations

import json
import sys
from pathlib import Path

_SERVER = Path(__file__).resolve().parents[1]
if str(_SERVER) not in sys.path:
    sys.path.insert(0, str(_SERVER))

from src.chat.memory.store import get_memory_store  # noqa: E402


def main() -> None:
    store = get_memory_store()
    summary = store.sanitize_all_groups()
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
