from __future__ import annotations

import re
import time
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

# 短问 / 招呼 / 明显求回应（主动插话启发式）
_SHORT_QUESTION_RE = re.compile(
    r"(吗|么|呢|？|\?|啥|怎么|怎样|为何|为什么|行不行|可不可以|要不要|是不是|有没有)",
)
_GREETING_RE = re.compile(r"^(早|早安|早上好|中午好|午安|晚上好|晚安|嗨|哈喽|hello|hi|在吗|在不在)\s*$", re.I)
_INVITE_RE = re.compile(r"(谁|有人|大家|咱们|我们).{0,8}(觉得|知道|推荐|说说|聊聊)")
_DRAW_RE = re.compile(r"(画|画画|画一张|画个|帮我画|生成.*(图|图片|插画))", re.I)


def is_game_command(text: str) -> bool:
    t = (text or "").strip()
    if not t:
        return False
    # 纯媒体占位（[图片]/[CQ:image…]）不是游戏指令
    if re.fullmatch(r"(?:\[(?:CQ:[^\]]+|图片|表情包?[^\]]*)\])+", t, flags=re.I):
        return False
    return bool(_COMMAND_RE.match(t))


def is_draw_intent(text: str) -> bool:
    return bool(_DRAW_RE.search(text or ""))


def _proactive_match(text: str) -> str | None:
    t = (text or "").strip()
    if not t or len(t) > 80:
        return None
    if _GREETING_RE.match(t):
        return "proactive_greeting"
    if _INVITE_RE.search(t):
        return "proactive_invite"
    if len(t) <= 40 and _SHORT_QUESTION_RE.search(t):
        return "proactive_question"
    return None


def decide(
    *,
    hints_at_bot: bool = False,
    hints_wake_word: bool = False,
    hints_reply_to_bot: bool = False,
    text: str = "",
    bot_names: list[str] | None = None,
    proactive_enabled: bool = True,
    last_bot_reply_at: float = 0.0,
    proactive_cooldown_sec: float = 45.0,
    reply_timestamps: list[float] | None = None,
    proactive_max_per_min: int = 3,
    now: float | None = None,
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

    if not proactive_enabled:
        return "skip", "no_trigger"

    reason = _proactive_match(text)
    if not reason:
        return "skip", "no_trigger"

    ts = now if now is not None else time.time()
    if last_bot_reply_at and (ts - last_bot_reply_at) < proactive_cooldown_sec:
        return "skip", "proactive_cooldown"

    stamps = reply_timestamps or []
    recent = [t for t in stamps if ts - t <= 60.0]
    if len(recent) >= max(1, proactive_max_per_min):
        return "skip", "proactive_rate_limit"

    return "reply", reason
