from pathlib import Path

_PLUGIN_ROOT = Path(__file__).resolve().parents[4]  # .../yoyo-plugin


def game_data_root() -> Path:
    return _PLUGIN_ROOT / "data" / "game"
