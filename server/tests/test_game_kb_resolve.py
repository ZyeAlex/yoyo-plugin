import json

from src.chat.game_kb.resolve import lookup_entity, resolve_name
from src.chat.game_kb.expand import expand_links
from src.chat.game_kb import run_lookups
from src.chat.game_kb.loader import clear_loader_cache_for_tests


def setup_function():
    clear_loader_cache_for_tests()


def test_resolve_alias_tang_youyou():
    hits = resolve_name("唐悠悠")
    assert ("hero", "101003") in hits


def test_lookup_hero_by_name():
    out = lookup_entity("hero", "寒悠悠")
    assert out["ok"] is True
    assert out["id"] == "101003"
    assert out["card"]["name"] == "寒悠悠"


def test_lookup_missing():
    out = lookup_entity("hero", "绝对不存在的角色xyz")
    assert out["ok"] is False
    assert "图鉴" in (out.get("hint") or "")


def test_expand_suit_related_pet():
    # suit.yaml id 1 relatedPet 森彩灵蝶
    out = expand_links("suit", "1", ["relatedPet"])
    assert out["ok"] is True
    blob = str(out.get("links") or out)
    assert "森彩灵蝶" in blob or "pet" in blob.lower()


def test_run_lookups_formats_block():
    text = run_lookups([{"type": "lookup", "kind": "hero", "q": "寒悠悠"}], max_ops=2)
    assert "【工具结果】" in text
    assert "寒悠悠" in text


def test_run_lookups_json_lines_uncut_and_capped():
    text = run_lookups(
        [
            {
                "type": "expand",
                "kind": "hero",
                "id": "101006",
                "edges": ["element", "profession", "group"],
            },
            {"type": "lookup", "kind": "hero", "q": "101003"},
        ],
        max_ops=2,
    )
    assert text.startswith("【工具结果】")
    assert len(text) <= 4000
    for line in text.split("\n")[1:]:
        json.loads(line)
