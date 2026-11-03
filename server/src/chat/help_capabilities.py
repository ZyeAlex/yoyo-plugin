"""从插件 config/help.yaml 派生：能力注入文案 + 游戏指令跳过规则。"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path

import yaml

_logger = logging.getLogger("yoyo.chat.help")

_PLUGIN_ROOT = Path(__file__).resolve().parents[3]
_HELP_PATH = _PLUGIN_ROOT / "config" / "help.yaml"
_CONFIG_PATH = _PLUGIN_ROOT / "config" / "config.yaml"

# 帮助里角色类条目的示例名（help.yaml 用「寒悠悠」占位）
_EXAMPLE_NAME = "寒悠悠"
_MEDIA_ONLY_RE = re.compile(
    r"(?:\[(?:CQ:[^\]]+|图片|表情包?[^\]]*)\])+",
    re.I,
)
# 对齐 apps/img.js：角色图片+序号，可无前缀（~# 可选）
_HERO_IMG_CMD_RE = re.compile(
    r"^[~#～]?\s*.{0,10}(?:图片?|照片|美图|美照)\s*\d{1,4}\s*$",
    re.I,
)
_DEFAULT_PREFIX = "~"


@dataclass
class _CompiledCommands:
    exact: re.Pattern[str] | None = None
    templated: re.Pattern[str] | None = None


@dataclass
class _HelpCache:
    mtime: float = -1.0
    capability_text: str = ""
    commands: _CompiledCommands | None = None
    display_prefix: str = _DEFAULT_PREFIX


_cache = _HelpCache(commands=_CompiledCommands())


def help_yaml_path() -> Path:
    return _HELP_PATH


def _load_rule_prefixes() -> list[str]:
    """读 config.yaml 的 rulePrefix；展示用 [0]，匹配用全部。"""
    path = _CONFIG_PATH
    if not path.exists():
        return [_DEFAULT_PREFIX]
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError) as err:
        _logger.warning("config.yaml load failed: %s", err)
        return [_DEFAULT_PREFIX]
    raw = data.get("rulePrefix") if isinstance(data, dict) else None
    if isinstance(raw, list):
        out = [str(x).strip() for x in raw if str(x).strip()]
        return out or [_DEFAULT_PREFIX]
    if isinstance(raw, str) and raw.strip():
        return [raw.strip()]
    return [_DEFAULT_PREFIX]


def _display_prefix(prefixes: list[str]) -> str:
    return (prefixes[0] if prefixes else _DEFAULT_PREFIX) or _DEFAULT_PREFIX


def _prefix_alt(prefixes: list[str]) -> str:
    """指令前缀正则备选：配置里的 + 常见 #～~。"""
    seen: set[str] = set()
    parts: list[str] = []
    for p in list(prefixes) + ["#", "～", "~"]:
        s = str(p or "").strip()
        if not s or s in seen:
            continue
        seen.add(s)
        parts.append(re.escape(s))
    return "|".join(parts) if parts else re.escape(_DEFAULT_PREFIX)


def _load_groups(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError) as err:
        _logger.warning("help.yaml load failed: %s", err)
        return []
    groups = data.get("helpGroup") if isinstance(data, dict) else None
    return groups if isinstance(groups, list) else []


def _normalize_title(title: str) -> str:
    t = (title or "").strip()
    t = re.sub(r"^[#～~]+\s*", "", t)
    t = re.sub(r"xx$", "", t, flags=re.I)
    t = re.sub(r"\d+$", "", t)
    return t.strip()


def _display_title(title: str, prefix: str) -> str:
    """help.yaml 里用 # 占位，注入时换成 rulePrefix[0]。"""
    t = (title or "").strip()
    if t.startswith("#"):
        return f"{prefix}{t[1:]}"
    if t.startswith(("～", "~")):
        return f"{prefix}{t[1:]}"
    return t


def _title_to_pattern(stem: str) -> str:
    """把帮助 title 变成可匹配的正则片段（含角色名占位）。"""
    if not stem:
        return ""
    if _EXAMPLE_NAME in stem:
        parts = stem.split(_EXAMPLE_NAME)
        out: list[str] = []
        for i, part in enumerate(parts):
            if part:
                out.append(re.escape(part))
            if i < len(parts) - 1:
                out.append(r".{1,12}")
        return "".join(out)
    return re.escape(stem)


def _build_from_groups(
    groups: list[dict],
    *,
    prefixes: list[str],
) -> tuple[str, _CompiledCommands]:
    prefix = _display_prefix(prefixes)
    pref_alt = _prefix_alt(prefixes)
    lines: list[str] = [
        f"【你在本群能用的机器人能力｜指令前缀是「{prefix}」】",
        "下面清单只给你自己知道有什么功能；**不要当老师纠正别人怎么打指令**。",
        f"**禁止**说「少个{prefix}」「带{prefix}号」「加{prefix}再发」这类指点，也不要因此叫人杂鱼。",
        f"用户要整页图鉴/面板/签到：他们自己发「{prefix}…」即可，**不需要 @你**；"
        "你不要假装已执行这些指令。对方没问「怎么用」就别主动教前缀。",
        "闲聊里问某个角色/奇波/套装「是谁、什么元素、关联什么」时，"
        "用 replies 里的 lookup/expand 查（见 persona 图鉴工具），"
        f"不要用「发{prefix}图鉴」敷衍单名问答。"
        "问长相/立绘用 look。",
    ]
    exact: list[str] = []
    templated: list[str] = []
    seen: set[str] = set()

    for g in groups:
        if not isinstance(g, dict):
            continue
        group_name = str(g.get("group") or "").strip() or "其他"
        items = g.get("list") or []
        if not isinstance(items, list):
            continue
        bullets: list[str] = []
        for it in items:
            if not isinstance(it, dict):
                continue
            title = str(it.get("title") or "").strip()
            desc = str(it.get("desc") or "").strip()
            if not title:
                continue
            shown = _display_title(title, prefix)
            if desc:
                bullets.append(f"{shown} — {desc}")
            else:
                bullets.append(shown)
            stem = _normalize_title(title)
            pat = _title_to_pattern(stem)
            if not pat or pat in seen:
                continue
            seen.add(pat)
            if ".{1,12}" in pat:
                templated.append(pat)
            else:
                exact.append(pat)
        if bullets:
            joined = "；".join(bullets[:12])
            lines.append(f"- {group_name}：{joined}")

    lines.append(
        "- 群聊：闲聊、表情包；若系统开了画画工具，用户点名让你画时再认真接，不要主动推销"
    )
    text = "\n".join(lines)
    cmds = _CompiledCommands()
    if exact:
        cmds.exact = re.compile(rf"^\s*(?:{pref_alt})?\s*(?:{'|'.join(exact)})", re.I)
    if templated:
        # 角色名占位类必须带前缀，避免「我想看xx图鉴」误判
        cmds.templated = re.compile(rf"^\s*(?:{pref_alt})\s*(?:{'|'.join(templated)})", re.I)
    return text, cmds


def _refresh() -> None:
    path = _HELP_PATH
    cfg = _CONFIG_PATH
    try:
        mtime = path.stat().st_mtime if path.exists() else -1.0
    except OSError:
        mtime = -1.0
    try:
        if cfg.exists():
            mtime = max(mtime, cfg.stat().st_mtime)
    except OSError:
        pass
    prefixes = _load_rule_prefixes()
    display = _display_prefix(prefixes)
    if mtime == _cache.mtime and _cache.capability_text and _cache.display_prefix == display:
        return
    groups = _load_groups(path)
    text, cmds = _build_from_groups(groups, prefixes=prefixes)
    _cache.mtime = mtime
    _cache.capability_text = text
    _cache.commands = cmds
    _cache.display_prefix = display


def capability_block() -> str:
    """注入 system 的能力说明（按 help/config mtime 缓存）。"""
    _refresh()
    return _cache.capability_text


def _command_probe_text(text: str) -> str:
    """去掉 @/CQ，便于识别「@bot 寒悠悠图片16」。"""
    t = (text or "").strip()
    if not t:
        return ""
    t = re.sub(r"\[CQ:[^\]]+\]", " ", t, flags=re.I)
    t = re.sub(r"@\d+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def is_game_command(text: str) -> bool:
    """正文是否像 help 里列出的游戏/插件指令（聊天侧跳过）。"""
    t = _command_probe_text(text)
    if not t:
        return False
    if _MEDIA_ONLY_RE.fullmatch(t):
        return False
    if _HERO_IMG_CMD_RE.match(t):
        return True
    _refresh()
    cmds = _cache.commands or _CompiledCommands()
    if cmds.exact and cmds.exact.match(t):
        return True
    if cmds.templated and cmds.templated.match(t):
        return True
    return False


def reset_help_cache_for_tests() -> None:
    _cache.mtime = -1.0
    _cache.capability_text = ""
    _cache.commands = _CompiledCommands()
    _cache.display_prefix = _DEFAULT_PREFIX
