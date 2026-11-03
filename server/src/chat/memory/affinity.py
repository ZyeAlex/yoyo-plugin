"""群内、对人的好感。0–100，默认 50。只接受小幅增减，不能直接写绝对分。"""

from __future__ import annotations

AFFINITY_DEFAULT = 50
AFFINITY_DELTA_LIMIT = 3


def clamp_affinity(value: object, *, default: int = AFFINITY_DEFAULT) -> int:
    try:
        n = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    return max(0, min(100, n))


def affinity_of(user: dict | None) -> int:
    if not isinstance(user, dict) or "affinity" not in user:
        return AFFINITY_DEFAULT
    return clamp_affinity(user.get("affinity"))


def has_affinity(user: dict | None) -> bool:
    return isinstance(user, dict) and "affinity" in user and user.get("affinity") not in (None, "")


def parse_affinity_delta(raw: object) -> int:
    try:
        n = int(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0
    return max(-AFFINITY_DELTA_LIMIT, min(AFFINITY_DELTA_LIMIT, n))


def apply_affinity_delta(current: int, raw_delta: object) -> int:
    return clamp_affinity(clamp_affinity(current) + parse_affinity_delta(raw_delta))


def affinity_band(score: int) -> str:
    n = clamp_affinity(score)
    if n <= 20:
        return "冷淡"
    if n <= 40:
        return "客气"
    if n <= 60:
        return "普通"
    if n <= 80:
        return "熟"
    return "亲近"


def format_affinity_line(score: int) -> str:
    n = clamp_affinity(score)
    return f"好感:{n}（{affinity_band(n)}，悠悠自己的刻度，不是权限，别主动报数字）"
