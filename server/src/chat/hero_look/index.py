from __future__ import annotations

import json
import random
import struct
from pathlib import Path
from typing import Any

from src.chat.hero_look.paths import _IMAGE_SUFFIXES, hero_imgs_index_path


def load_hero_img_index() -> dict[str, list[str]]:
    path = hero_imgs_index_path()
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    out: dict[str, list[str]] = {}
    for k, v in data.items():
        if isinstance(v, list):
            out[str(k)] = [str(x) for x in v if str(x).strip()]
    return out


def _usable(paths: list[str]) -> list[str]:
    ok: list[str] = []
    for raw in paths:
        p = Path(raw)
        if p.suffix.lower() not in _IMAGE_SUFFIXES:
            continue
        if p.is_file():
            ok.append(str(p.resolve()))
    return ok


def _jpeg_size(data: bytes) -> tuple[int, int] | None:
    if len(data) < 4 or data[:2] != b"\xff\xd8":
        return None
    i = 2
    while i + 9 < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xC0, 0xC1, 0xC2):
            height, width = struct.unpack(">HH", data[i + 5 : i + 9])
            if width > 0 and height > 0:
                return width, height
            return None
        if marker in (0xD8, 0xD9):
            i += 2
            continue
        if i + 4 > len(data):
            break
        seglen = struct.unpack(">H", data[i + 2 : i + 4])[0]
        if seglen < 2:
            break
        i += 2 + seglen
    return None


def _pixel_size(path: Path) -> tuple[int, int] | None:
    try:
        head = path.read_bytes()[:65536]
    except OSError:
        return None
    if head[:8] == b"\x89PNG\r\n\x1a\n" and len(head) >= 24:
        width, height = struct.unpack(">II", head[16:24])
        if width > 0 and height > 0:
            return width, height
        return None
    return _jpeg_size(head)


def _is_portrait(path: str) -> bool:
    size = _pixel_size(Path(path))
    if not size:
        return False
    width, height = size
    return width >= 400 and height >= int(width * 1.15)


def _shuffle(items: list[str], rng: Any | None) -> list[str]:
    out = list(items)
    if rng is None:
        random.shuffle(out)
        return out
    shuffle = getattr(rng, "shuffle", None)
    if callable(shuffle):
        shuffle(out)
    return out


def hero_img_candidates(hero_id: str, *, limit: int = 3, rng: Any = None) -> list[str]:
    """Portrait-like files first, so look does not open on a wide group shot."""
    paths = _usable(load_hero_img_index().get(str(hero_id), []))
    if not paths:
        return []
    tall = [p for p in paths if _is_portrait(p)]
    rest = [p for p in paths if p not in tall]
    ordered = _shuffle(tall, rng) + _shuffle(rest, rng)
    cap = max(0, int(limit or 0))
    if cap <= 0:
        return []
    return ordered[:cap]


def pick_hero_img(hero_id: str, *, rng: Any = None) -> str | None:
    paths = _usable(load_hero_img_index().get(str(hero_id), []))
    if not paths:
        return None
    chooser = rng if rng is not None else random
    return chooser.choice(paths)
