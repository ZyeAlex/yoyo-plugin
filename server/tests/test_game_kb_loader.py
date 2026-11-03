# server/tests/test_game_kb_loader.py
from src.chat.game_kb.loader import load_yaml
from src.chat.game_kb.paths import game_data_root


def test_game_data_root_points_at_data_game():
    root = game_data_root()
    assert (root / "hero.yaml").is_file()
    assert (root / "lore" / "promilia.yaml").is_file()


def test_load_hero_yaml_has_101003():
    data = load_yaml("hero")
    assert isinstance(data, dict)
    assert "101003" in data
    assert data["101003"]["name"] == "寒悠悠"
