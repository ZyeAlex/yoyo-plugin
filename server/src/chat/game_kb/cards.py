from __future__ import annotations

from typing import Any

from src.chat.game_kb.loader import load_yaml

_LORE_TITLE_ALLOW = ("世界观", "地区", "阵营", "种族", "元素", "职业", "普罗米利亚")
_SKILL_CAP = 6
_HERO_TEXT_CAP = 200
_HERO_KEYS = (
    "id",
    "name",
    "englishName",
    "page",
    "rarity",
    "element",
    "profession",
    "group",
    "race",
    "birthday",
    "intro",
    "desc",
    "skills",
)
_PET_KEYS = ("id", "name", "element", "race", "stage", "tag", "feature", "desc")
_SUIT_KEYS = ("id", "name", "effect2", "effect4", "relatedPet")


def _skill_names(skills: Any) -> list[dict[str, str]]:
    if not isinstance(skills, list):
        return []
    names: list[dict[str, str]] = []
    for item in skills:
        if len(names) >= _SKILL_CAP:
            break
        if isinstance(item, dict):
            name = item.get("name")
        else:
            name = item
        if name is None or name == "":
            continue
        names.append({"name": name})
    return names


def hero_card(raw: dict) -> dict:
    src = raw if isinstance(raw, dict) else {}
    card: dict[str, Any] = {}
    for key in _HERO_KEYS:
        if key not in src:
            continue
        if key == "skills":
            card["skills"] = _skill_names(src.get("skills"))
            continue
        value = src[key]
        if key in ("intro", "desc") and isinstance(value, str):
            card[key] = value[:_HERO_TEXT_CAP]
        else:
            card[key] = value
    return card


def pet_card(raw: dict) -> dict:
    src = raw if isinstance(raw, dict) else {}
    card: dict[str, Any] = {}
    for key in _PET_KEYS:
        if key not in src:
            continue
        value = src[key]
        if key == "desc" and isinstance(value, str):
            card[key] = value[:200]
        else:
            card[key] = value
    return card


def suit_card(raw: dict) -> dict:
    src = raw if isinstance(raw, dict) else {}
    return {key: src[key] for key in _SUIT_KEYS if key in src}


def self_hero_card(hero_id: str = "101003") -> dict | None:
    data = load_yaml("hero")
    if not isinstance(data, dict):
        return None
    raw = data.get(str(hero_id))
    if not isinstance(raw, dict):
        return None
    return hero_card(raw)


def _lore_title_allowed(title: str) -> bool:
    return any(token in title for token in _LORE_TITLE_ALLOW)


def lore_l0_text(*, max_chars: int = 2000) -> str:
    chunks: list[str] = []
    for stem in ("lore/promilia", "lore/game-info"):
        doc = load_yaml(stem)
        if not isinstance(doc, dict):
            continue
        sections = doc.get("sections")
        if not isinstance(sections, list):
            continue
        for sec in sections:
            if not isinstance(sec, dict):
                continue
            title = str(sec.get("title") or "")
            if not _lore_title_allowed(title):
                continue
            text = str(sec.get("text") or "").strip()
            if not text:
                continue
            chunks.append(f"{title}：{text[:400]}")
    return "\n\n".join(chunks)[:max_chars]


def game_l0_block(*, self_hero_id: str = "101003", max_chars: int = 2800) -> str:
    lore = lore_l0_text(max_chars=max(500, max_chars // 2))
    self_card = self_hero_card(self_hero_id) or {}
    nick = load_yaml("nickname") or {}
    aliases = nick.get(str(self_hero_id)) or []
    if not isinstance(aliases, list):
        aliases = [aliases] if aliases else []
    alias_text = "、".join(str(a) for a in aliases if a) or "无"
    lines = [
        "【星原世界观】",
        lore or "（暂无）",
        f"【悠悠自己｜图鉴 id={self_hero_id}】",
        f"名:{self_card.get('name')} 元素:{self_card.get('element')} "
        f"职业:{self_card.get('profession')} 阵营:{self_card.get('group')}",
        f"简介:{(self_card.get('intro') or self_card.get('desc') or '')[:160]}",
        f"别名:{alias_text}",
        "纪律:游戏事实以本块与【工具结果】为准。"
        "听到没把握的角色/奇波/套装名：在 replies 里 lookup/expand，禁止空口编。"
        "整页图鉴/面板/签到才引导用户发 ~指令（不必@）；单名问答不要用指令代替查询。",
    ]
    text = "\n".join(lines)
    return text[:max_chars]
