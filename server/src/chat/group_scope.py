"""蓝色星原功能只在群名含「蓝色星原」的群开启。不读配置。"""

from __future__ import annotations

XINGYUAN_MARK = "蓝色星原"


def is_xingyuan_group(group_name: str | None) -> bool:
    return XINGYUAN_MARK in str(group_name or "")


def group_scope_note(group_name: str | None) -> str:
    name = str(group_name or "").strip() or "未知"
    return f"【本群】群名：{name}。"
