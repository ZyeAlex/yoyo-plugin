from __future__ import annotations

import re

# 拒写：游戏 lore / 数值 / 密钥 / 提示词与工具实现细节
_REJECT_RES = [
    re.compile(r"(api[_\s-]?key|sk-[a-z0-9]{10,}|Bearer\s+\S+)", re.I),
    re.compile(r"(system\s*prompt|你是「悠悠」|persona\.md)", re.I),
    re.compile(r"(activate_tools|tool_call|uvicorn|src\.chat)", re.I),
    re.compile(r"(攻击力|防御力|生命值|暴击率|元素伤害|技能倍率)", re.I),
    re.compile(r"(普罗米利亚|BWIKI|图鉴数据|wiki\.biligame)", re.I),
    re.compile(r"(专武|星赐|灵子图鉴|奇波图鉴).{0,20}\d", re.I),
    # 插件指令口吻不是群约定。写进记忆后会每轮回灌，模型就反复叫人加 ~。
    re.compile(r"(~号|加~|带~|~绑定|指令前缀|发指令|发送指令|具体指令|指令需|指令要|指令格式|插件指令)"),
    re.compile(r"(发送\s*#|可发送\s*#|#角色图鉴|#抽卡|#寒悠悠|#源千代)"),
]

_ALLOW_HINT = re.compile(
    r"(喜欢|讨厌|忌讳|别叫|称呼|群规|约定|梗|黑话|意思是|以后叫我|记得)",
    re.I,
)

# 机器人自称 / 显示名，禁止写进「用户」nickname/alias
_BOT_DISPLAY_NAMES = frozenset(
    {
        "悠悠",
        "悠悠bot",
        "悠悠机器人",
        "寒悠悠",
        "本小姐",
        "yoyo",
        "yoyobot",
        "bot",
        "群一bot",
    }
)

# 用户画像字段里出现的「其实在写悠悠自己 / 把嘴炮写成用户偏好」
_BOT_SELF_ATTR = re.compile(
    r"^(悠悠|寒悠悠|本小姐|悠悠bot)"
    r"|悠悠自称"
    r"|悠悠不(喜欢|接受|玩|帮|希望)"
    r"|悠悠(拒绝|反感|调侃|称呼|要求|同意|用)"
    r"|别拉我比"
    r"|本小姐可没有主人"
    r"|不喜被拉着比较"
    r"|拿不同游戏互相比较"
    r"|只要联机有的玩",
    re.I,
)

# 群画像噪声：单次嘴炮 / 过度复读的互怼约定
_GROUP_NOISE = re.compile(
    r"^(悠悠(会|被|自称|不)|用户与悠悠|群友之间习惯用|群内(会用|互相调侃|可用|以互称|用))",
    re.I,
)

# —— 成熟记忆方案：只留「跨会话仍有用」的稳定事实；事件流水 / 单次状态一律拒 ——
_EVENT_LOG = re.compile(
    r"^(用户\(?\d|用户\d|用户ID|被用户|对用户)"
    r"|用户\([0-9]{5,}\)"
    r"|用户[0-9]{5,}"
    r"|曾向用户|发送带有"
    r"|本回合|这一轮",
    re.I,
)
_EPHEMERAL = re.compile(
    r"(今天|刚才|刚刚|本轮|这句|有点吓人|肚子|难受|洗澡|异味|"
    r"表现出|可能处于|试图掩盖|承认自己有错|记错了|"
    r"看腿|性暗示|骚扰要挟)",
    re.I,
)
_BOT_NARRATIVE = re.compile(
    r"(被悠悠|悠悠(称为|评价|指出|反感|拒绝|答应|对用户|调侃)|"
    r"称呼悠悠|向悠悠|与悠悠|和悠悠|跟悠悠|"
    r"昵称为悠悠|ID\s*2575547802)",
    re.I,
)
_QQ_IN_TEXT = re.compile(r"\d{5,14}")


def reject_reason(text: str) -> str | None:
    t = (text or "").strip()
    if not t:
        return "empty"
    if len(t) > 500:
        return "too_long"
    for rx in _REJECT_RES:
        if rx.search(t):
            return f"blocked:{rx.pattern[:40]}"
    return None


def validate_fact(text: str, *, require_allow_hint: bool = False) -> bool:
    if reject_reason(text):
        return False
    if require_allow_hint and not _ALLOW_HINT.search(text):
        return True
    return True


def normalize_fact_key(text: str) -> str:
    """去空白标点，便于近重复去重。"""
    t = (text or "").strip().lower()
    return re.sub(r"[\s\W_]+", "", t, flags=re.UNICODE)


def is_bot_display_name(name: str) -> bool:
    n = re.sub(r"\s+", "", (name or "").strip().lower())
    if not n:
        return False
    if n in _BOT_DISPLAY_NAMES:
        return True
    # 含 bot 且同时像悠悠
    if "悠悠" in n and ("bot" in n or "机器人" in n):
        return True
    return False


def sanitize_display_name(name: str) -> str:
    """用户昵称/称呼：拒写机器人名；含「悠悠」的串号 alias 也清掉。"""
    raw = (name or "").strip()
    if not raw or reject_reason(raw) or is_bot_display_name(raw):
        return ""
    if "悠悠" in raw or "寒悠悠" in raw:
        return ""
    return raw[:64]


def is_bot_self_attribution(text: str) -> bool:
    """像在写悠悠本人设定/嘴炮，不该进「该用户」偏好/忌讳/备注。"""
    t = (text or "").strip()
    if not t:
        return True
    return bool(_BOT_SELF_ATTR.search(t))


def is_junk_user_fact(text: str) -> bool:
    """单次事件、情绪流水、带 QQ 的旁白、悠悠反应叙事 → 不配进长期画像。"""
    t = (text or "").strip()
    if not t:
        return True
    if is_bot_self_attribution(t):
        return True
    if _EVENT_LOG.search(t):
        return True
    if _EPHEMERAL.search(t):
        return True
    if _BOT_NARRATIVE.search(t):
        return True
    if _QQ_IN_TEXT.search(t):
        return True
    # 氛围复读 / 互怼口头禅，不是稳定画像
    if "杂鱼" in t and re.search(r"(自称|互怼|调侃|玩笑|称呼)", t):
        return True
    # 稳定事实宜短；长篇旁白多半是抽取器流水账
    if len(t) > 48:
        return True
    return False


def filter_facts(items: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in items or []:
        s = str(raw or "").strip()
        if not s:
            continue
        if reject_reason(s):
            continue
        s = s[:240]
        key = normalize_fact_key(s)
        if not key or key in seen:
            continue
        # 与已保留条近重复（互相包含）
        redundant = False
        for prev in list(seen):
            if key in prev or prev in key:
                redundant = True
                break
        if redundant:
            continue
        seen.add(key)
        out.append(s)
    return out


def filter_user_facts(items: list[str]) -> list[str]:
    """用户画像列表：剥机器人自述 + 事件流水 + 短暂状态。"""
    return [x for x in filter_facts(items) if not is_junk_user_fact(x)]


def filter_group_facts(items: list[str]) -> list[str]:
    """群约定：去近重 + 丢掉明显噪声复读。"""
    cleaned: list[str] = []
    for s in filter_facts(items):
        if reject_reason(s):
            continue
        hard = bool(re.search(r"(群规|约定|不能|禁止|勿|别发|不发)", s))
        # 群约定里写悠悠本人故事/氛围 → 噪声（硬规则例外）
        if ("悠悠" in s or "寒悠悠" in s) and not hard:
            continue
        if _BOT_NARRATIVE.search(s) and not hard:
            continue
        if _QQ_IN_TEXT.search(s) and not hard:
            continue
        if "杂鱼" in s and not hard:
            continue
        # 保留带「群规/约定/不能/禁止」的；噪声口吻且无硬约定词则丢
        if _GROUP_NOISE.search(s) and not re.search(r"(群规|约定|不能|禁止|勿|别发)", s):
            if "不能" not in s and "禁止" not in s and "别发" not in s and "约定" not in s:
                continue
        cleaned.append(s)
    return cleaned


def dedupe_existing_lines(lines: list[str]) -> list[str]:
    """清洗已落盘的群画像行。"""
    return filter_group_facts([ln.strip() for ln in lines if ln.strip()])
