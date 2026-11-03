import json
from pathlib import Path

import pytest

from src.chat.hero_look.describe import _extract_desc, describe_first_clear, vlm_desc, weak_desc
from src.core.settings import Settings


@pytest.mark.asyncio
async def test_vlm_desc_returns_none_when_unconfigured(tmp_path):
    img = tmp_path / "a.png"
    img.write_bytes(b"x")
    settings = Settings(llm_api_key="")
    assert await vlm_desc(settings, img, hero_id="101003", name="寒悠悠") is None


def test_extract_desc_from_json_object():
    raw = json.dumps({"desc": "深棕长发，紫粉色眼睛，白裙清纯"}, ensure_ascii=False)
    assert "深棕" in (_extract_desc(raw) or "")


def test_extract_desc_rejects_meta_reasoning():
    junk = (
        "我们需要回答中文，不超过200字。系统要求response format必须严格遵循"
        'schema: {"type":"json_object"}。'
    )
    assert _extract_desc(junk) is None


def test_extract_desc_unwraps_nested_json_string():
    inner = json.dumps({"外貌要点": "黑发侧髻，紫瞳，白裙"}, ensure_ascii=False)
    raw = json.dumps({"desc": inner}, ensure_ascii=False)
    out = _extract_desc(raw) or ""
    assert "黑发" in out
    assert "{" not in out


def test_extract_desc_rejects_multi_character_confusion():
    raw = json.dumps(
        {"desc": "图中有三个角色，左边黑发粉衣，中间蓝发，无法确定哪个是寒悠悠"},
        ensure_ascii=False,
    )
    assert _extract_desc(raw) is None


def test_extract_desc_from_waipao_key():
    raw = json.dumps({"外貌要点": "黑发红瞳，校服"}, ensure_ascii=False)
    assert "黑发" in (_extract_desc(raw) or "")


@pytest.mark.asyncio
async def test_describe_first_clear_skips_rejected(tmp_path, monkeypatch):
    first = tmp_path / "a.png"
    second = tmp_path / "b.png"
    first.write_bytes(b"a")
    second.write_bytes(b"b")
    seen: list[str] = []

    async def fake(_settings, image_path, *, hero_id, name):
        seen.append(Path(image_path).name)
        if Path(image_path).name == "a.png":
            return None
        return "黑发紫瞳，白裙"

    monkeypatch.setattr("src.chat.hero_look.describe.vlm_desc", fake)
    desc, path = await describe_first_clear(None, [first, second], hero_id="101003", name="寒悠悠")
    assert desc == "黑发紫瞳，白裙"
    assert path == second
    assert seen == ["a.png", "b.png"]


def test_weak_desc_no_dict_dump():
    text = weak_desc("101003", "寒悠悠")
    assert "tex_icon" not in text
    assert "{" not in text
    assert "寒悠悠" in text
