from __future__ import annotations

import re
from typing import Literal

Action = Literal["reply", "skip"]

# 明显交给游戏插件的指令，聊天侧跳过
_COMMAND_RE = re.compile(
    r"^\s*[#～~]?\s*("
    r"角色图鉴|奇波图鉴|灵子图鉴|物品图鉴|装备图鉴|套装图鉴|"
    r"签到|换老婆|抽卡|绑定UID|UID|面板|"
    r"更新图鉴数据|悠悠更新|清除无效数据|悠悠登录|"
    r"安装悠悠|卸载悠悠|启动悠悠|停止悠悠|重启悠悠|"
    r".{1,12}(图鉴|技能|星赐|攻略|语音|图片|别名)"
    r")",
    re.I,
)


def is_game_command(text: str) -> bool:
    t = (text or "").strip()
    if not t:
        return False
    return bool(_COMMAND_RE.match(t))


def decide(
    *,
    hints_at_bot: bool = False,
    hints_wake_word: bool = False,
    hints_reply_to_bot: bool = False,
    text: str = "",
    bot_names: list[str] | None = None,
) -> tuple[Action, str]:
    """纯规则判定。ack_busy 由 mainline 在 tool_running 时另行处理。"""
    if is_game_command(text):
        return "skip", "game_command"

    if hints_at_bot:
        return "reply", "at_bot"
    if hints_wake_word:
        return "reply", "wake_word"
    if hints_reply_to_bot:
        return "reply", "reply_to_bot"

    names = [n.strip() for n in (bot_names or []) if n and str(n).strip()]
    lowered = (text or "").strip()
    for name in names:
        if name and name in lowered:
            return "reply", "bot_name"

    return "skip", "no_trigger"
