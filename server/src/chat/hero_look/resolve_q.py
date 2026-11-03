from __future__ import annotations

from src.chat.game_kb.resolve import get_record, resolve_name


def resolve_look_query(q: str, *, self_hero_id: str) -> tuple[str, str] | None:
    raw = (q or "").strip()
    self_id = str(self_hero_id or "101003").strip() or "101003"
    if not raw or raw.lower() == "self":
        rec = get_record("hero", self_id) or {}
        name = str(rec.get("name") or self_id)
        return self_id, name
    rec = get_record("hero", raw)
    if rec:
        return str(rec.get("id") or raw), str(rec.get("name") or raw)
    for kind, eid in resolve_name(raw):
        if kind == "hero":
            found = get_record("hero", eid) or {}
            return str(eid), str(found.get("name") or raw)
    return None
