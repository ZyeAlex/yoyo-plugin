from pathlib import Path

_PLUGIN_ROOT = Path(__file__).resolve().parents[4]  # .../yoyo-plugin
_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def plugin_root() -> Path:
    return _PLUGIN_ROOT


def hero_imgs_index_path() -> Path:
    return _PLUGIN_ROOT / "data" / "cache" / "hero_imgs.json"


def looks_media_dir(session_id: str = "") -> Path:
    base = _PLUGIN_ROOT / "server" / "data" / "media" / "looks"
    if session_id:
        safe = "".join(c if c.isalnum() or c in "-_:" else "_" for c in session_id)[:80]
        return base / safe
    return base
