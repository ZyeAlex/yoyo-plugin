import asyncio
import json
import uuid
from pathlib import Path

import pytest

from src.chat.mainline import MainlineManager, reset_mainline_manager_for_tests
from src.chat.schema import ChatHints, ChatRequest, SessionInfo
from src.core.settings import Settings


def _settings(**overrides) -> Settings:
    base = dict(
        chat_hero_look_enabled=True,
        chat_hero_look_max_per_turn=1,
        chat_game_kb_enabled=True,
        chat_game_self_hero_id="101003",
        chat_memory_enabled=False,
        chat_sticker_reply_enabled=False,
        chat_heat_enabled=False,
        chat_heat_debounce_sec=0.05,
        chat_vision_enabled=False,
        llm_api_key="x",
        proactive_enabled=True,
        tools_enabled=True,
        chat_draw_model="mock-draw",
        draw_mock_delay_sec=30,
    )
    base.update(overrides)
    return Settings(**base)


def _req(text: str = "你长什么样"):
    gid = f"hl{uuid.uuid4().hex[:8]}"
    sid = f"group:{gid}:bot:2"
    req = ChatRequest(
        request_id=gid,
        session=SessionInfo(
            session_id=sid, group_id=gid, bot_id="2", group_name="蓝色星原闲聊"
        ),
        message={
            "user_id": "1",
            "sender": {"nickname": "t"},
            "message": [{"type": "text", "text": text}],
            "raw_message": text,
        },
        recent=[],
        hints=ChatHints(at_bot=True, wake_word=False, reply_to_bot=False),
    )
    return sid, req


async def _await_outbox(mgr, sid, timeout=3.0):
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        pending = mgr.drain_pending(sid)
        if pending and pending.action == "reply" and pending.replies:
            return pending
        await asyncio.sleep(0.05)
    return None


def _cancel_jobs(mgr, sid) -> None:
    ml = mgr.get(sid)
    for task in list(getattr(ml, "job_tasks", {}).values()):
        if task is not None and not task.done():
            task.cancel()


def _seed_index(tmp_path: Path, monkeypatch, img: Path) -> None:
    index = tmp_path / "data" / "cache" / "hero_imgs.json"
    index.parent.mkdir(parents=True)
    index.write_text(json.dumps({"101003": [str(img)]}), encoding="utf-8")
    monkeypatch.setattr("src.chat.hero_look.paths._PLUGIN_ROOT", tmp_path)
    monkeypatch.setattr(
        "src.chat.hero_look.resolve_q.get_record",
        lambda kind, eid: {"id": "101003", "name": "寒悠悠"} if eid == "101003" else None,
    )
    monkeypatch.setattr(
        "src.chat.hero_look.describe.get_record",
        lambda kind, eid: {"id": "101003", "name": "寒悠悠"} if eid == "101003" else None,
    )


@pytest.mark.asyncio
async def test_look_then_text_no_auto_draw(tmp_path, monkeypatch):
    img = tmp_path / "h.png"
    img.write_bytes(b"png")
    _seed_index(tmp_path, monkeypatch, img)

    calls = {"n": 0}

    async def fake_llm(messages, settings, *, abort_event=None):
        calls["n"] += 1
        content = str(messages[-1].get("content") or "")
        if calls["n"] == 1:
            return '{"engagement":"hold","replies":[{"type":"look","q":"self"}]}'
        assert "【工具结果】" in content
        assert "hero_look" in content
        assert str(img) not in content
        return '{"engagement":"hold","replies":[{"type":"text","text":"白发红瞳啦"}]}'

    mgr = reset_mainline_manager_for_tests(
        MainlineManager(settings=_settings(), llm_complete=fake_llm)
    )
    sid, req = _req()
    try:
        await mgr.handle(req)
        out = await _await_outbox(mgr, sid)
        assert out is not None
        assert out.replies[0].text == "白发红瞳啦"
        assert calls["n"] == 2
        ml = mgr.get(sid)
        assert ml.pending_look_ref is not None
        assert Path(ml.pending_look_ref["path"]).is_file()
        assert not ml.jobs
    finally:
        _cancel_jobs(mgr, sid)
        reset_mainline_manager_for_tests()


@pytest.mark.asyncio
async def test_draw_use_ref_uses_pending_when_no_user_photo(tmp_path, monkeypatch):
    img = tmp_path / "h.png"
    img.write_bytes(b"png")
    _seed_index(tmp_path, monkeypatch, img)

    calls = {"n": 0}

    async def fake_llm(messages, settings, *, abort_event=None):
        calls["n"] += 1
        if calls["n"] == 1:
            return '{"engagement":"hold","replies":[{"type":"look","q":"self"}]}'
        return (
            '{"engagement":"hold","replies":['
            '{"type":"text","text":"稍等"},'
            '{"type":"draw","prompt":"赛博街头","use_ref":true}]}'
        )

    mgr = reset_mainline_manager_for_tests(
        MainlineManager(settings=_settings(), llm_complete=fake_llm)
    )
    sid, req = _req("画一张你")
    try:
        await mgr.handle(req)
        out = await _await_outbox(mgr, sid)
        assert out is not None
        ml = mgr.get(sid)
        assert ml.jobs, "expected draw job"
        job = ml.jobs[-1]
        assert job.get("mode") == "edit"
        srcs = [str(s) for s in (job.get("sources") or [])]
        assert any("101003" in s for s in srcs)
        assert ml.pending_look_ref is None
    finally:
        _cancel_jobs(mgr, sid)
        reset_mainline_manager_for_tests()


@pytest.mark.asyncio
async def test_user_photo_beats_look_ref(tmp_path, monkeypatch):
    look_img = tmp_path / "look.png"
    look_img.write_bytes(b"png")
    user_img = tmp_path / "user.jpg"
    user_img.write_bytes(b"jpg")
    monkeypatch.setattr("src.chat.hero_look.paths._PLUGIN_ROOT", tmp_path)

    async def fake_llm(messages, settings, *, abort_event=None):
        return (
            '{"engagement":"hold","replies":['
            '{"type":"draw","prompt":"改成赛博","use_ref":true}]}'
        )

    mgr = reset_mainline_manager_for_tests(
        MainlineManager(settings=_settings(), llm_complete=fake_llm)
    )
    sid, req = _req("按这个改")
    req.message["message"] = [
        {"type": "text", "text": "按这个改"},
        {"type": "image", "url": str(user_img)},
    ]
    ml = mgr.get(sid)
    ml.pending_look_ref = {
        "hero_id": "101003",
        "name": "寒悠悠",
        "path": str(look_img),
        "ts": 1.0,
    }
    try:
        await mgr.handle(req)
        out = await _await_outbox(mgr, sid)
        assert out is not None
        job = mgr.get(sid).jobs[-1]
        srcs = [str(s) for s in (job.get("sources") or [])]
        assert any("user.jpg" in s for s in srcs)
        assert not any("look.png" in s for s in srcs)
    finally:
        _cancel_jobs(mgr, sid)
        reset_mainline_manager_for_tests()
