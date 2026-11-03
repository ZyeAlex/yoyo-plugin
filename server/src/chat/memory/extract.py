from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from src.chat.llm import LLMError, complete
from src.chat.memory.affinity import parse_affinity_delta
from src.chat.memory.guards import (
    filter_group_facts,
    filter_user_facts,
    sanitize_display_name,
)
from src.chat.memory.retrieve import index_texts
from src.chat.memory.slang import detect_slang_question
from src.chat.memory.store import MemoryStore, get_memory_store
from src.core.settings import Settings

_logger = logging.getLogger("yoyo.chat.memory.extract")

_EXTRACT_SYSTEM = """你是群聊长期记忆抽取器。只写「下周还用得上」的稳定事实；拿不准就空着（NOOP）。
输出严格 JSON（不要 markdown）：
{
  "group_facts": ["稳定群规/约定，短句"],
  "user_updates": {
    "alias": "",
    "preferences": [],
    "taboos": [],
    "notes": [],
    "from_others": [],
    "affinity_delta": 0,
    "impression": ""
  },
  "slang": [{"term":"","meaning":"","examples":[]}],
  "daily_note": "一句今日摘要，可空"
}

字段边界（必须遵守）：
1. user_updates **只描述本回合人类用户**（见 user 消息里的 QQ），不是悠悠。
2. **不要写 nickname**：群名片由平台注入，抽取器不许填。
3. alias：别人稳定怎么叫**该用户**（如「小长门」）；禁止含「悠悠/寒悠悠/本小姐」。
4. preferences / taboos / notes：只写跨会话仍成立的短句（≤20字优先）。
   - 要写：喜欢X、讨厌被叫Y、别发原神表情、习惯发图不说话
   - **禁止**：本轮事件流水（「用户xxx曾向…」「发送带有…」）、短暂状态（肚子难受/今天心情）、悠悠的反应/嘴炮、带 QQ 号的旁白
5. from_others：仅**其他人类**对该用户的稳定评价；禁止「被悠悠称为…」。无则 []。
6. affinity_delta：整数，只能是 -3 到 3。这轮让关系明显热一点就 +1～+3，冷一点就 -1～-3，拿不准写 0。禁止写绝对好感分。
7. impression：一句悠悠对**这个人**的看法（≤20字），不是事实、不是悠悠自己的习惯。没有就空串。
8. group_facts：可复用群规（如「蓝原群不发原神表情」）。
   - 禁止氛围废话、指令教学（#xxx / ~号）、单次闲聊、wiki/数值。
9. 无新稳定信息：全部留空，不要硬编。"""


def _parse_json_obj(text: str) -> dict[str, Any] | None:
    raw = (text or "").strip()
    if not raw:
        return None
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        obj = json.loads(raw)
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", raw)
        if not m:
            return None
        try:
            obj = json.loads(m.group(0))
            return obj if isinstance(obj, dict) else None
        except json.JSONDecodeError:
            return None


def _user_patch_from_obj(uu: dict[str, Any]) -> dict[str, Any]:
    """LLM 不得写 nickname（由 Yunzai 名片回写）；只收稳定 alias/偏好。"""
    patch: dict[str, Any] = {}
    alias = sanitize_display_name(str(uu.get("alias") or ""))
    if alias:
        patch["alias"] = alias
    for k in ("preferences", "taboos", "notes", "from_others"):
        if isinstance(uu.get(k), list) and uu[k]:
            cleaned = filter_user_facts([str(x) for x in uu[k]])
            if cleaned:
                patch[k] = cleaned
    if "affinity_delta" in uu:
        delta = parse_affinity_delta(uu.get("affinity_delta"))
        if delta:
            patch["affinity_delta"] = delta
    impression = str(uu.get("impression") or "").strip()
    if impression:
        kept = filter_user_facts([impression])
        if kept:
            patch["impression"] = kept[0][:40]
    return patch


async def extract_turn(
    settings: Settings,
    *,
    group_id: str,
    user_id: str,
    user_text: str,
    bot_replies: list[str],
    store: MemoryStore | None = None,
) -> dict[str, Any]:
    store = store or get_memory_store()
    result: dict[str, Any] = {"ok": False, "written": {}}

    if not settings.chat_memory_enabled or not settings.chat_extract_enabled:
        return result

    slang_q = detect_slang_question(user_text)

    bot_lines = "\n".join(f"悠悠: {t}" for t in (bot_replies or []) if str(t).strip()) or "悠悠: （空）"
    user_blob = (
        f"本回合人类用户 QQ={user_id}（user_updates 只能写这个人，不能写悠悠）\n"
        f"用户({user_id}): {user_text}\n"
        f"{bot_lines}\n"
    )
    if slang_q:
        user_blob += f"（用户在问黑话「{slang_q}」的含义，若回复已解释请写入 slang）\n"

    try:
        raw = await complete(
            [
                {"role": "system", "content": _EXTRACT_SYSTEM},
                {"role": "user", "content": user_blob},
            ],
            settings,
        )
    except LLMError as e:
        _logger.warning("extract llm failed: %s", e)
        return result

    obj = _parse_json_obj(raw)
    if not obj:
        _logger.warning("extract parse failed: %s", raw[:200])
        return result

    written: dict[str, Any] = {}

    facts = filter_group_facts([str(x) for x in (obj.get("group_facts") or [])])
    if facts:
        written["group_facts"] = store.append_group_facts(group_id, facts)

    uu = obj.get("user_updates") if isinstance(obj.get("user_updates"), dict) else {}
    patch = _user_patch_from_obj(uu)
    if patch and user_id:
        store.update_user(group_id, user_id, patch)
        written["user"] = True

    slang_items = obj.get("slang") if isinstance(obj.get("slang"), list) else []
    slang_n = 0
    for s in slang_items:
        if not isinstance(s, dict):
            continue
        if store.upsert_slang(
            group_id,
            str(s.get("term") or ""),
            str(s.get("meaning") or ""),
            [str(x) for x in (s.get("examples") or [])],
        ):
            slang_n += 1
    written["slang"] = slang_n

    daily = str(obj.get("daily_note") or "").strip()
    if daily and store.append_daily_note(group_id, daily):
        written["daily"] = True

    to_index: list[tuple[str, str, str]] = []
    for f in facts:
        to_index.append(("group", f"fact-{hash(f) & 0xFFFF}", f))
    if daily:
        to_index.append(("daily", daily[:40], daily))
    for s in slang_items:
        if isinstance(s, dict) and s.get("term") and s.get("meaning"):
            t = f"{s['term']}={s['meaning']}"
            to_index.append(("slang", str(s["term"]), t))
    try:
        written["indexed"] = await index_texts(settings, group_id, to_index)
    except Exception as e:
        _logger.warning("index after extract failed: %s", e)
        written["indexed"] = 0

    result["ok"] = True
    result["written"] = written
    return result


def schedule_extract_memory(
    settings: Settings,
    *,
    group_id: str,
    user_id: str,
    user_text: str,
    bot_replies: list[str],
) -> None:
    if not settings.chat_memory_enabled or not settings.chat_extract_enabled:
        return

    async def _run() -> None:
        try:
            await extract_turn(
                settings,
                group_id=group_id,
                user_id=user_id,
                user_text=user_text,
                bot_replies=bot_replies,
            )
        except Exception as e:
            _logger.exception("async extract failed: %s", e)

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_run())
    except RuntimeError:
        _logger.warning("no running loop for extract")
