import asyncio

import pytest

from src.chat.mainline import MainlineManager, reset_mainline_manager_for_tests
from src.chat.schema import ChatHints, ChatRequest, SessionInfo
from src.core.settings import Settings


async def _await_outbox(mgr, sid, timeout=3.0):
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        pending = mgr.drain_pending(sid)
        if pending and pending.action == "reply" and pending.replies:
            return pending
        await asyncio.sleep(0.05)
    return None


@pytest.mark.asyncio
async def test_tts_job_outbox_record_only(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.tts.paths._SERVER_ROOT", tmp_path)
    monkeypatch.setattr(
        "src.chat.mainline._OUTBOUND_IMAGE_ROOTS",
        (tmp_path / "data" / "stickers", tmp_path / "data" / "media"),
    )

    async def fake_synth(**k):
        return b"VOICEWAV"

    monkeypatch.setattr("src.chat.tts.job.synthesize_speech", fake_synth)

    async def persona_tts(messages, settings, *, abort_event=None):
        return '{"engagement":"hold","replies":[{"type":"tts","text":"嗨嗨"},{"type":"text","text":"旁白不要发"}]}'

    settings = Settings(
        llm_api_key="x",
        chat_heat_enabled=False,
        chat_memory_enabled=False,
        chat_game_kb_enabled=False,
        chat_web_search_enabled=False,
        chat_hero_look_enabled=False,
        tools_enabled=False,
        chat_tts_base_url="http://tts/v1",
        chat_tts_api_key="k",
        chat_tts_model="m",
        chat_tts_voice="default",
        chat_heat_debounce_sec=0.05,
    )
    mgr = reset_mainline_manager_for_tests(
        MainlineManager(settings=settings, llm_complete=persona_tts)
    )
    sid = "group:tts1:bot:2"
    req = ChatRequest(
        request_id="tts-1",
        session=SessionInfo(session_id=sid, group_id="tts1", bot_id="2", group_name="闲聊"),
        message={
            "user_id": "100",
            "sender": {"nickname": "测"},
            "raw_message": "说句话",
            "message": [{"type": "text", "text": "说句话"}],
        },
        recent=[],
        hints=ChatHints(at_bot=True),
    )
    data = await mgr.handle(req)
    # silent start: tool_started with empty replies OR hold then generate
    assert data.reason in {"hold", "tool_started"}
    if data.reason == "hold":
        # wait for speak debounce then pending
        await asyncio.sleep(0.2)
    pending = await _await_outbox(mgr, sid, timeout=5.0)
    assert pending is not None
    assert pending.action == "reply"
    types = [r.type for r in pending.replies]
    assert "record" in types
    assert not any(r.type == "text" and r.text and "旁白" in (r.text or "") for r in pending.replies)
    rec = next(r for r in pending.replies if r.type == "record")
    assert rec.path
    assert open(rec.path, "rb").read() == b"VOICEWAV"


@pytest.mark.asyncio
async def test_tts_running_does_not_ack_busy(tmp_path, monkeypatch):
    """语音 job 进行中：主动找她不回「别急我正在语音」，也不挡主线。"""

    async def persona(messages, settings, *, abort_event=None):
        return '{"engagement":"hold","replies":[{"type":"text","text":"在呢"}]}'

    settings = Settings(
        llm_api_key="x",
        chat_heat_enabled=False,
        chat_memory_enabled=False,
        chat_game_kb_enabled=False,
        chat_web_search_enabled=False,
        chat_hero_look_enabled=False,
        tools_enabled=False,
        chat_tts_base_url="http://tts/v1",
        chat_tts_api_key="k",
        chat_tts_model="m",
        chat_tts_voice="default",
        chat_heat_debounce_sec=0.05,
        proactive_enabled=True,
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=persona))
    sid = "group:tts2:bot:2"
    ml = mgr.get(sid, group_id="tts2")
    ml.jobs.append(
        {
            "id": "tts-fake",
            "name": "语音",
            "status": "running",
            "mode": "tts",
            "prompt": "嗨",
        }
    )
    ml.phase = "tool_running"

    req = ChatRequest(
        request_id="t2",
        session=SessionInfo(session_id=sid, group_id="tts2", bot_id="2", group_name="闲聊"),
        message={
            "user_id": "100",
            "sender": {"nickname": "测"},
            "raw_message": "你在吗",
            "message": [{"type": "text", "text": "你在吗"}],
        },
        recent=[],
        hints=ChatHints(at_bot=True),
    )
    second = await mgr.handle(req)
    assert second.action != "ack_busy"
    assert second.reason != "tool_running"
    assert not any(
        r.type == "text" and "正在语音" in (r.text or "") for r in (second.replies or [])
    )
