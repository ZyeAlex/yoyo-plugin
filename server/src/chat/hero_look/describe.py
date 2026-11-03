from __future__ import annotations

import base64
import json
import logging
import re
from pathlib import Path

from src.chat.game_kb.resolve import get_record
from src.chat.llm import complete
from src.core.settings import Settings

_logger = logging.getLogger("yoyo.chat.hero_look.describe")

_HINT_OK = (
    '若要按此角色长相画画：replies 加 {"type":"draw","prompt":"场景与画风","use_ref":true}；'
    "不要空口编五官。"
)
_HINT_MISS = "本地没有该角色立绘；可换名字或引导用户发图当参考。"
_MIME = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}
# complete() 强制 response_format=json_object，必须要 JSON
_VLM_SYSTEM = (
    '只输出一个 JSON 对象：{"desc":"……"}。'
    "desc 为不超过 120 字的中文外貌要点（发色发型、五官气质、服装配色）；"
    "禁止数值/技能/剧情；禁止解释规则、禁止输出 schema/思考过程。"
)
_BAD_DESC_RE = re.compile(
    r"(json_object|response format|schema|我们需要|系统要求|不要输出|严格执行|thinking"
    r"|哪个是|三个角色|无法确定)",
    re.I,
)


def hint_ok() -> str:
    return _HINT_OK


def hint_miss() -> str:
    return _HINT_MISS


def _field_text(val) -> str:
    if val in (None, "", []):
        return ""
    if isinstance(val, list):
        parts: list[str] = []
        for x in val:
            if x in (None, ""):
                continue
            if isinstance(x, dict):
                label = x.get("name") or x.get("id")
                if label not in (None, ""):
                    parts.append(str(label))
            else:
                parts.append(str(x))
        return "、".join(parts)
    if isinstance(val, dict):
        label = val.get("name") or val.get("id")
        return str(label) if label not in (None, "") else ""
    return str(val)


def weak_desc(hero_id: str, name: str) -> str:
    rec = get_record("hero", hero_id) or {}
    bits = [name or str(rec.get("name") or hero_id)]
    for key in ("race", "element", "profession"):
        text = _field_text(rec.get(key))
        if text:
            bits.append(text)
    if "element" not in rec or rec.get("element") in (None, ""):
        text = _field_text(rec.get("elements"))
        if text:
            bits.append(text)
    body = "，".join(b for b in bits if b)
    return f"{body}。外貌以参考立绘为准，勿编造未给出的五官细节。"[:200]


def _caption_from_obj(data: dict) -> str:
    desc = str(data.get("desc") or data.get("外貌要点") or data.get("description") or "").strip()
    if desc:
        return desc
    vals = [v for v in data.values() if isinstance(v, str) and v.strip()]
    if len(vals) == 1:
        return vals[0].strip()
    return ""


def _unwrap_caption(text: str, depth: int = 0) -> str:
    raw = (text or "").strip()
    if not raw or depth > 2:
        return raw
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:].strip()
    data: object | None = None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, flags=re.S)
        if match:
            try:
                data = json.loads(match.group(0))
            except json.JSONDecodeError:
                data = None
    if isinstance(data, dict):
        inner = _caption_from_obj(data)
        if inner and inner != raw:
            return _unwrap_caption(inner, depth + 1)
        return inner
    if isinstance(data, str) and data != raw:
        return _unwrap_caption(data, depth + 1)
    return raw


def _extract_desc(raw: str) -> str | None:
    desc = _unwrap_caption(raw).replace("\n", " ").strip()
    if not desc or len(desc) < 4:
        return None
    if _BAD_DESC_RE.search(desc):
        return None
    if "{" in desc or "schema" in desc.lower():
        return None
    return desc[:200]


async def vlm_desc(
    settings: Settings, image_path: Path, *, hero_id: str, name: str
) -> str | None:
    path = Path(image_path)
    if not path.is_file():
        return None
    call = settings
    if not call.llm_configured:
        return None
    try:
        raw = path.read_bytes()
    except OSError:
        return None
    if not raw:
        return None
    b64 = base64.b64encode(raw).decode("ascii")
    mime = _MIME.get(path.suffix.lower(), "image/png")
    messages = [
        {"role": "system", "content": _VLM_SYSTEM},
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": f'给角色「{name}」立绘写外貌。只回 {{"desc":"..."}}。',
                },
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
            ],
        },
    ]
    try:
        content = await complete(messages, call)
    except Exception:
        _logger.warning("hero look vlm failed path=%s", path, exc_info=True)
        return None
    desc = _extract_desc(content or "")
    if not desc:
        _logger.info("hero look vlm rejected junk path=%s raw=%s", path, (content or "")[:120])
    return desc


async def describe_first_clear(
    settings: Settings, paths: list[Path], *, hero_id: str, name: str
) -> tuple[str | None, Path | None]:
    """Try images until one yields a usable appearance caption."""
    for raw in paths:
        path = Path(raw)
        desc = await vlm_desc(settings, path, hero_id=hero_id, name=name)
        if desc:
            return desc, path
    return None, None
