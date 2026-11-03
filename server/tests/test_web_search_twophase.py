import asyncio
import json
import uuid

import pytest

from src.chat.mainline import MainlineManager, reset_mainline_manager_for_tests
from src.chat.schema import ChatHints, ChatRequest, SessionInfo
from src.core.settings import Settings


def _settings(**overrides) -> Settings:
    base = dict(
        chat_game_kb_enabled=False,
        chat_web_search_enabled=True,
        chat_web_search_max_results=4,
        chat_memory_enabled=False,
        chat_sticker_reply_enabled=False,
        chat_heat_enabled=False,
        chat_heat_debounce_sec=0.05,
        llm_api_key="x",
        proactive_enabled=True,
        tools_enabled=False,
    )
    base.update(overrides)
    return Settings(**base)


def _req(text: str = "上海今天天气") -> tuple[str, ChatRequest]:
    gid = f"ws{uuid.uuid4().hex[:8]}"
    sid = f"group:{gid}:bot:2"
    req = ChatRequest(
        request_id=gid,
        session=SessionInfo(session_id=sid, group_id=gid, bot_id="2"),
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


async def _await_outbox(mgr: MainlineManager, sid: str, timeout: float = 3.0):
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        pending = mgr.drain_pending(sid)
        if pending and pending.action == "reply" and pending.replies:
            return pending
        await asyncio.sleep(0.05)
    return None


def _blob(tool: str, **extra) -> str:
    payload = {"tool": tool, "ok": True, **extra}
    return "【工具结果】\n" + json.dumps(payload, ensure_ascii=False)


@pytest.mark.asyncio
async def test_web_search_triggers_second_llm(monkeypatch):
    calls = {"n": 0}

    def fake_run(ops, **kwargs):
        assert ops[0]["type"] == "web_search"
        assert ops[0]["q"] == "上海天气"
        assert kwargs["max_results"] == 4
        return _blob(
            "web_search",
            query="上海天气",
            results=[
                {
                    "title": "天气",
                    "url": "https://example.com/w",
                    "content": "晴",
                    "score": 1.0,
                }
            ],
        )

    monkeypatch.setattr("src.chat.web_search.ops.run_web_ops", fake_run)
    monkeypatch.setattr("src.chat.web_search.run_web_ops", fake_run)

    async def fake_llm(messages, settings, *, abort_event=None):
        calls["n"] += 1
        content = str(messages[-1].get("content") or "")
        if calls["n"] == 1:
            return (
                '{"engagement":"hold","replies":['
                '{"type":"web_search","q":"上海天气","intent":"general"}'
                "]}"
            )
        assert "【工具结果】" in content
        assert "https://example.com/w" in content
        assert "请依据【工具结果】" in content
        return '{"engagement":"hold","replies":[{"type":"text","text":"今天晴，来源 example.com/w"}]}'

    mgr = reset_mainline_manager_for_tests(
        MainlineManager(settings=_settings(), llm_complete=fake_llm)
    )
    sid, req = _req()
    await mgr.handle(req)
    pending = await _await_outbox(mgr, sid)
    assert pending and pending.replies
    assert pending.replies[0].text == "今天晴，来源 example.com/w"
    assert calls["n"] == 2
    assert all(r.type == "text" for r in pending.replies)


@pytest.mark.asyncio
async def test_web_fetch_after_search_is_third_call(monkeypatch):
    calls = {"n": 0}

    def fake_run(ops, **kwargs):
        typ = ops[0]["type"]
        if typ == "web_search":
            return _blob(
                "web_search",
                results=[{"title": "天气", "url": "https://example.com/w", "content": "摘要"}],
            )
        assert ops[0]["url"] == "https://example.com/w"
        return _blob("web_fetch", url="https://example.com/w", title="天气页", content="正文是晴")

    monkeypatch.setattr("src.chat.web_search.ops.run_web_ops", fake_run)
    monkeypatch.setattr("src.chat.web_search.run_web_ops", fake_run)

    async def fake_llm(messages, settings, *, abort_event=None):
        calls["n"] += 1
        content = str(messages[-1].get("content") or "")
        if calls["n"] == 1:
            return '{"engagement":"hold","replies":[{"type":"web_search","q":"上海天气"}]}'
        if calls["n"] == 2:
            assert "摘要" in content
            return (
                '{"engagement":"hold","replies":['
                '{"type":"web_fetch","url":"https://example.com/w"}'
                "]}"
            )
        assert "正文是晴" in content
        return '{"engagement":"hold","replies":[{"type":"text","text":"我看了正文，今天晴"}]}'

    mgr = reset_mainline_manager_for_tests(
        MainlineManager(settings=_settings(), llm_complete=fake_llm)
    )
    sid, req = _req()
    await mgr.handle(req)
    pending = await _await_outbox(mgr, sid)
    assert pending and pending.replies
    assert pending.replies[0].text == "我看了正文，今天晴"
    assert calls["n"] == 3


@pytest.mark.asyncio
async def test_web_disabled_does_not_search(monkeypatch):
    calls = {"n": 0}

    def fake_run(ops, **kwargs):
        raise AssertionError("disabled search should not run")

    monkeypatch.setattr("src.chat.web_search.ops.run_web_ops", fake_run)
    monkeypatch.setattr("src.chat.web_search.run_web_ops", fake_run)

    async def fake_llm(messages, settings, *, abort_event=None):
        calls["n"] += 1
        return (
            '{"engagement":"hold","replies":['
            '{"type":"web_search","q":"上海天气"},'
            '{"type":"text","text":"我不知道，没法查"}'
            "]}"
        )

    mgr = reset_mainline_manager_for_tests(
        MainlineManager(
            settings=_settings(chat_web_search_enabled=False),
            llm_complete=fake_llm,
        )
    )
    sid, req = _req()
    await mgr.handle(req)
    pending = await _await_outbox(mgr, sid)
    assert pending and pending.replies
    assert pending.replies[0].text == "我不知道，没法查"
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_web_prompt_follows_switch():
    on = MainlineManager(settings=_settings(chat_web_search_enabled=True))
    off = MainlineManager(settings=_settings(chat_web_search_enabled=False))
    sid, req = _req()
    ml = on.get(sid, group_id=req.session.group_id)
    sys_on = (await on._build_messages(req, ml, "上海今天天气"))[0]["content"]
    sys_off = (await off._build_messages(req, ml, "上海今天天气"))[0]["content"]
    assert "【联网工具｜本轮可声明】" in sys_on
    assert '"type":"web_search"' in sys_on
    assert '"type":"web_fetch"' in sys_on
    assert "【联网工具｜本轮可声明】" not in sys_off
