from __future__ import annotations

from typing import Any

from src.chat.game_kb.resolve import entity_card, get_record, lookup_entity

_EDGES = frozenset({"element", "profession", "group", "relatedPet"})
_MISSING_HINT = "未收录该条目，可让用户发 ~图鉴 查看正式卡片。"


def _split_names(value: Any) -> list[str]:
    if value in (None, ""):
        return []
    if isinstance(value, list):
        names: list[str] = []
        for item in value:
            if isinstance(item, dict):
                name = item.get("name")
                if name not in (None, ""):
                    names.append(str(name))
            elif item not in (None, ""):
                names.append(str(item))
        return names
    if isinstance(value, dict):
        name = value.get("name")
        return [str(name)] if name not in (None, "") else []
    text = str(value)
    for sep in ("、", ",", "，", "/", "|"):
        text = text.replace(sep, "、")
    return [part.strip() for part in text.split("、") if part.strip()]


def _field_names(rec: dict, edge: str) -> list[str]:
    if edge == "element":
        keys = ("element", "elements", "elementData")
    elif edge == "profession":
        keys = ("profession", "professionData")
    else:
        keys = ("group", "groupData")
    names: list[str] = []
    seen: set[str] = set()
    for key in keys:
        for name in _split_names(rec.get(key)):
            if name in seen:
                continue
            seen.add(name)
            names.append(name)
    return names


def _link_lookup(kind: str, q: str, edge: str) -> dict[str, Any]:
    hit = lookup_entity(kind, q)
    if hit.get("ok"):
        return {
            "edge": edge,
            "kind": kind,
            "id": hit.get("id"),
            "card": hit.get("card"),
        }
    return {"edge": edge, "kind": kind, "q": q, "ok": False}


def expand_links(kind: str, id: str, edges: list[str]) -> dict:
    kind_s = str(kind or "").strip()
    eid = str(id or "").strip()
    rec = get_record(kind_s, eid)
    if rec is None:
        return {"ok": False, "kind": kind_s, "id": eid, "hint": _MISSING_HINT}

    links: list[dict[str, Any]] = []
    for edge in edges or []:
        edge_s = str(edge or "").strip()
        if edge_s not in _EDGES:
            continue
        if edge_s == "relatedPet":
            name = rec.get("relatedPet")
            if name in (None, ""):
                continue
            hit = lookup_entity("pet", str(name))
            if hit.get("ok"):
                links.append(
                    {
                        "edge": "relatedPet",
                        "kind": "pet",
                        "id": hit.get("id"),
                        "card": hit.get("card"),
                    }
                )
            else:
                links.append({"edge": "relatedPet", "kind": "pet", "name": str(name)})
            continue
        target_kind = edge_s
        for name in _field_names(rec, edge_s):
            links.append(_link_lookup(target_kind, name, edge_s))

    return {
        "ok": True,
        "kind": kind_s,
        "id": eid,
        "card": entity_card(kind_s, rec),
        "links": links,
    }
