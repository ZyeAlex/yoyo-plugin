from src.chat.game_kb.cards import (
    game_l0_block,
    hero_card,
    lore_l0_text,
    pet_card,
    self_hero_card,
    suit_card,
)
from src.chat.game_kb.loader import clear_loader_cache_for_tests


def setup_function():
    clear_loader_cache_for_tests()


def test_self_hero_card_youyou():
    card = self_hero_card("101003")
    assert card is not None
    assert card["name"] == "寒悠悠"
    assert "火" in str(card.get("element"))
    assert "skills" in card
    assert all("desc" not in s for s in card["skills"])
    for dropped in (
        "voices",
        "talents",
        "elements",
        "professionData",
        "elementData",
        "groupData",
        "headIcon",
        "battleVoices",
    ):
        assert dropped not in card


def test_game_l0_block_mentions_world_and_self():
    text = game_l0_block(self_hero_id="101003", max_chars=2800)
    assert "【星原世界观】" in text
    assert "【悠悠自己" in text
    assert "寒悠悠" in text
    assert len(text) <= 2800


def test_hero_card_strips_icons_and_skill_bodies():
    raw = {
        "id": "101003",
        "name": "寒悠悠",
        "element": "火、木",
        "profession": "增幅",
        "group": "辰王朝-镜花洲",
        "intro": "乐观自信",
        "desc": "我叫寒悠悠",
        "icon": "should-drop",
        "avatarIcon": "tex.png",
        "descHtml": "<b>html</b>",
        "template": "tpl",
        "professionData": {"name": "增幅", "icon": ["a.png"], "desc": "职业说明"},
        "skills": [
            {"name": "鸢回影", "icon": "s.png", "desc": "长文", "descHtml": "<p>", "template": "{0}"},
            {"name": "二", "desc": "x"},
            {"name": "三", "desc": "x"},
            {"name": "四", "desc": "x"},
            {"name": "五", "desc": "x"},
            {"name": "六", "desc": "x"},
            {"name": "七应被截断", "desc": "x"},
        ],
    }
    card = hero_card(raw)
    assert "icon" not in card
    assert "avatarIcon" not in card
    assert "descHtml" not in card
    assert "template" not in card
    assert card["name"] == "寒悠悠"
    assert card["skills"] == [
        {"name": "鸢回影"},
        {"name": "二"},
        {"name": "三"},
        {"name": "四"},
        {"name": "五"},
        {"name": "六"},
    ]
    assert "professionData" not in card
    assert set(card) <= {
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
    }


def test_pet_card_is_minimal_and_clips_desc():
    raw = {
        "id": "500001",
        "name": "迅狼",
        "element": "风",
        "race": ["异生类", "兽形族"],
        "stage": "成熟期",
        "tag": "输出",
        "feature": "迅捷",
        "desc": "A" * 250,
        "petIcon": "tex.png",
        "skills": [{"name": "狂风冲击", "desc": "长技能", "icon": "x"}],
        "fixedSkill": {"name": "迅风刃", "descHtml": "<span>"},
    }
    card = pet_card(raw)
    assert card == {
        "id": "500001",
        "name": "迅狼",
        "element": "风",
        "race": ["异生类", "兽形族"],
        "stage": "成熟期",
        "tag": "输出",
        "feature": "迅捷",
        "desc": "A" * 200,
    }


def test_suit_card_keeps_related_pet():
    raw = {
        "id": 1,
        "name": "蝶语迷梦",
        "effect2": "攻击力提升6.2%",
        "effect4": "携带者释放星鸣技后回复",
        "relatedPet": "森彩灵蝶",
        "skillDesc": "2件套：……",
        "icon": "drop.png",
    }
    card = suit_card(raw)
    assert card == {
        "id": 1,
        "name": "蝶语迷梦",
        "effect2": "攻击力提升6.2%",
        "effect4": "携带者释放星鸣技后回复",
        "relatedPet": "森彩灵蝶",
    }


def test_lore_l0_text_allowlist_and_clip():
    text = lore_l0_text(max_chars=2000)
    assert "世界观" in text
    assert "星临者" in text
    assert "前言" not in text
    assert "游戏开发历程" not in text
    assert len(text) <= 2000
    for block in text.split("\n\n"):
        if "：" in block:
            body = block.split("：", 1)[-1]
            assert len(body) <= 400


def test_self_hero_card_missing_returns_none():
    assert self_hero_card("999999") is None
