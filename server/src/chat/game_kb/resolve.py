from __future__ import annotations

import json
from typing import Any

from src.chat.game_kb.cards import hero_card, pet_card, suit_card
from src.chat.game_kb.loader import load_yaml

KIND_FILE = {
    "hero": "hero",
    "pet": "pet",
    "spirit": "spirit",
    "item": "item",
    "accessory": "accessory",
    "suit": "suit",
    "element": "element",
    "group": "groups",
    "profession": "profession",
}

_MISSING_HINT = "未收录该条目，可让用户发 ~图鉴 查看正式卡片。"
_KIND_KEYS: dict[str, tuple[str, ...]] = {
    "item": ("id", "page", "name", "typeName", "rarity", "rarityText", "desc", "source", "effect"),
    "accessory": ("id", "page", "name", "typeName", "rarity", "rarityText", "desc", "source", "suitName"),
    "spirit": ("id", "page", "name", "rarity", "profession", "attribute", "desc"),
    "element": ("id", "name"),
    "group": ("id", "name"),
    "profession": ("id", "name", "desc"),
}


def _as_alias_list(aliases: Any) -> list[str]:
    if isinstance(aliases, list):
        return [str(a) for a in aliases if a not in (None, "")]
    if aliases in (None, ""):
        return []
    return [str(aliases)]


def iter_records(kind: str) -> list[tuple[str, dict]]:
    stem = KIND_FILE.get(kind)
    if not stem:
        return []
    data = load_yaml(stem)
    out: list[tuple[str, dict]] = []
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, dict):
                rid = value.get("id")
                out.append((str(rid if rid not in (None, "") else key), value))
            else:
                out.append((str(key), {"id": str(key)}))
    elif isinstance(data, list):
        for value in data:
            if not isinstance(value, dict):
                continue
            rid = value.get("id")
            if rid in (None, ""):
                continue
            out.append((str(rid), value))
    return out


def get_record(kind: str, eid: str) -> dict | None:
    want = str(eid)
    for rid, rec in iter_records(kind):
        if rid == want:
            return rec
    return None


def _label_fields(rec: dict) -> list[str]:
    fields: list[str] = []
    for key in ("name", "page", "englishName"):
        value = rec.get(key)
        if value not in (None, ""):
            fields.append(str(value))
    return fields


def _nickname_ids(q: str) -> list[str]:
    nick = load_yaml("nickname")
    if not isinstance(nick, dict):
        return []
    exact: list[str] = []
    folded: list[str] = []
    qf = q.casefold()
    for hid, aliases in nick.items():
        names = _as_alias_list(aliases)
        if q in names:
            exact.append(str(hid))
        elif any(a.casefold() == qf for a in names):
            folded.append(str(hid))
    return exact or folded


def _resolve_in_kind(kind: str, q: str) -> list[str]:
    recs = iter_records(kind)
    for rid, _rec in recs:
        if rid == q:
            return [rid]
    if kind == "hero":
        nicks = _nickname_ids(q)
        if nicks:
            return nicks[:5]
    exact: list[str] = []
    for rid, rec in recs:
        if q in _label_fields(rec):
            exact.append(rid)
    if exact:
        return exact[:5]
    qf = q.casefold()
    contains: list[str] = []
    for rid, rec in recs:
        if any(qf in field.casefold() for field in _label_fields(rec)):
            contains.append(rid)
        if len(contains) >= 5:
            break
    return contains


def resolve_name(q: str) -> list[tuple[str, str]]:
    query = str(q or "").strip()
    if not query:
        return []
    hits: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()

    def add(kind: str, eid: str) -> None:
        key = (kind, str(eid))
        if key in seen:
            return
        seen.add(key)
        hits.append(key)

    for kind in KIND_FILE:
        if get_record(kind, query) is not None:
            add(kind, query)
    if hits:
        return hits[:5]

    for hid in _nickname_ids(query):
        add("hero", hid)
    if hits:
        return hits[:5]

    for kind in KIND_FILE:
        for rid, rec in iter_records(kind):
            if query in _label_fields(rec):
                add(kind, rid)
    if hits:
        return hits[:5]

    qf = query.casefold()
    for kind in KIND_FILE:
        for rid, rec in iter_records(kind):
            if any(qf in field.casefold() for field in _label_fields(rec)):
                add(kind, rid)
            if len(hits) >= 5:
                return hits[:5]
    return hits[:5]


def entity_card(kind: str, rec: dict | None) -> dict:
    raw = rec if isinstance(rec, dict) else {}
    if kind == "hero":
        return hero_card(raw)
    if kind == "pet":
        return pet_card(raw)
    if kind == "suit":
        return suit_card(raw)
    keys = _KIND_KEYS.get(kind)
    if keys:
        card: dict[str, Any] = {}
        for key in keys:
            if key not in raw:
                continue
            value = raw[key]
            if isinstance(value, str) and key == "desc":
                card[key] = value[:200]
            else:
                card[key] = value
        return card
    return {k: raw[k] for k in ("id", "name", "page") if k in raw}


def lookup_entity(kind: str, q: str) -> dict:
    kind_s = str(kind or "").strip()
    query = str(q or "").strip()
    if kind_s not in KIND_FILE:
        return {"ok": False, "kind": kind_s, "id": "", "hint": _MISSING_HINT}
    ids = _resolve_in_kind(kind_s, query)
    if not ids:
        return {"ok": False, "kind": kind_s, "id": "", "hint": _MISSING_HINT}
    eid = ids[0]
    rec = get_record(kind_s, eid)
    out: dict[str, Any] = {
        "ok": True,
        "kind": kind_s,
        "id": eid,
        "card": entity_card(kind_s, rec),
    }
    if len(ids) > 1:
        out["candidates"] = [{"kind": kind_s, "id": i} for i in ids[:5]]
    return out


_LOOKUP_HEADER = "【工具结果】"
_LOOKUP_MAX_CHARS = 4000


def run_lookups(ops: list[dict], *, max_ops: int = 2) -> str:
    from src.chat.game_kb.expand import expand_links

    payloads: list[str] = []
    try:
        limit = max(0, int(max_ops))
    except (TypeError, ValueError):
        limit = 0
    for op in (ops or [])[:limit]:
        if not isinstance(op, dict):
            continue
        typ = op.get("type")
        if typ == "lookup":
            payload = lookup_entity(str(op.get("kind") or ""), str(op.get("q") or ""))
        elif typ == "expand":
            payload = expand_links(
                str(op.get("from_kind") or op.get("kind") or ""),
                str(op.get("id") or ""),
                list(op.get("edges") or []),
            )
        else:
            continue
        payloads.append(json.dumps(payload, ensure_ascii=False, default=str))

    joined = _LOOKUP_HEADER
    for line in payloads:
        candidate = f"{joined}\n{line}"
        if len(candidate) > _LOOKUP_MAX_CHARS:
            break
        joined = candidate
    return joined
