from __future__ import annotations

from typing import Literal

from src.chat.help_capabilities import is_game_command

Action = Literal["reply", "skip"]

__all__ = ["Action", "decide", "is_game_command"]


def decide(
    *,
    hints_at_bot: bool = False,
    hints_wake_word: bool = False,
    hints_reply_to_bot: bool = False,
    text: str = "",
    bot_names: list[str] | None = None,
) -> tuple[Action, str]:
    """硬触发判定。插话节奏交给热度 + 快模型；热度关闭时仅硬触发。"""
    if is_game_command(text):
        return "skip", "game_command"

    if hints_at_bot:
        return "reply", "at_bot"
    if hints_wake_word:
        return "reply", "wake_word"
    if hints_reply_to_bot:
        return "reply", "reply_to_bot"

    from src.chat.temperature import _name_hit_not_embedded

    names = [n.strip() for n in (bot_names or []) if n and str(n).strip()]
    lowered = (text or "").strip()
    for name in names:
        if _name_hit_not_embedded(lowered, name):
            return "reply", "bot_name"

    return "skip", "no_trigger"
