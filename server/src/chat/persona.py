from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from src.chat.temperature import HeatState

_PROMPT_DIR = Path(__file__).resolve().parents[2] / "prompts"
_BASE = _PROMPT_DIR / "persona.md"
_XINGYUAN = _PROMPT_DIR / "persona-xingyuan.md"
_PLAIN = _PROMPT_DIR / "persona-plain.md"
_HEAT_DIR = _PROMPT_DIR / "heat"

HeatMode = Literal["cold", "warm", "hot"]

_HEAT_FILES: dict[HeatMode, Path] = {
    "cold": _HEAT_DIR / "cold.md",
    "warm": _HEAT_DIR / "warm.md",
    "hot": _HEAT_DIR / "hot.md",
}
_HEAT_LABELS: dict[HeatMode, str] = {
    "cold": "冷闲",
    "warm": "温观",
    "hot": "热聊",
}

_cache: dict[Path, tuple[float, str]] = {}


def _load(path: Path, fallback: str) -> str:
    """按 mtime 热加载；避免 uvicorn 不重启时一直用旧人设。"""
    if not path.exists():
        return fallback
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return fallback
    hit = _cache.get(path)
    if hit and hit[0] == mtime:
        return hit[1]
    text = path.read_text(encoding="utf-8").strip() or fallback
    _cache[path] = (mtime, text)
    return text


def load_persona() -> str:
    return _load(_BASE, "你是悠悠，QQ 群聊伙伴。用短句 JSON replies 回复。")


def load_xingyuan_persona() -> str:
    """图鉴、外观、插件指令。只拼进群名含「蓝色星原」的群。"""
    return _load(_XINGYUAN, "")


def load_plain_persona() -> str:
    """别人发指令时别接戏。只拼进群名不含「蓝色星原」的群。"""
    return _load(_PLAIN, "")


def resolve_heat_mode(heat: HeatState | None) -> HeatMode:
    """dwelling→热聊；observe→温观；其余 away/idle→冷闲。"""
    if heat is None:
        return "cold"
    sess = str(getattr(heat, "session", "") or "").strip().lower()
    if sess == "dwelling":
        return "hot"
    mode = str(getattr(heat, "mode", "") or "").strip().lower()
    if mode == "observe":
        return "warm"
    return "cold"


def heat_mode_label(mode: HeatMode) -> str:
    return _HEAT_LABELS.get(mode, mode)


def load_heat_prompt(mode: HeatMode) -> str:
    """只加载本轮热度对应提示词，不拼另外两态。"""
    path = _HEAT_FILES.get(mode) or _HEAT_FILES["cold"]
    return _load(path, "")


def clear_persona_cache_for_tests() -> None:
    _cache.clear()
