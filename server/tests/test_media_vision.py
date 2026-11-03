import pytest

from src.chat.mainline import MainlineManager, reset_mainline_manager_for_tests
from src.chat.schema import ChatHints, ChatRequest, SessionInfo
from src.core.settings import Settings


def test_select_current_photo():
    from src.chat.media.vision import select_vision_urls

    msg = {"message": [{"type": "image", "url": "https://x/p.jpg", "sub_type": 0}]}
    urls = select_vision_urls(message=msg, recent=[], settings=Settings(chat_vision_enabled=True))
    assert urls == ["https://x/p.jpg"]


def test_build_multimodal_content():
    from src.chat.media.vision import build_user_content

    c = build_user_content("看图", ["https://x/p.jpg"])
    assert isinstance(c, list)
    assert c[0]["type"] == "text"
    assert c[1]["type"] == "image_url"


def test_select_excludes_sticker():
    from src.chat.media.vision import select_vision_urls

    msg = {
        "message": [
            {"type": "image", "url": "https://x/s.png", "summary": "[动画表情]", "sub_type": 1},
        ]
    }
    urls = select_vision_urls(
        message=msg, recent=[], settings=Settings(chat_vision_enabled=True)
    )
    assert urls == []


def test_select_includes_recent_when_enabled():
    from src.chat.media.vision import select_vision_urls

    recent = [{"message": [{"type": "image", "url": "https://x/old.jpg", "sub_type": 0}]}]
    msg = {"message": [{"type": "text", "text": "这是什么水果，悠悠"}]}
    settings = Settings(chat_vision_enabled=True, chat_vision_include_recent_on_refer=True)
    urls = select_vision_urls(message=msg, recent=recent, settings=settings)
    assert urls == ["https://x/old.jpg"]

    off = Settings(chat_vision_enabled=True, chat_vision_include_recent_on_refer=False)
    assert select_vision_urls(message=msg, recent=recent, settings=off) == []


def test_select_recent_newest_first_max():
    from src.chat.media.vision import select_vision_urls

    recent = [
        {"message": [{"type": "image", "url": "https://x/1.jpg", "sub_type": 0}]},
        {"message": [{"type": "image", "url": "https://x/2.jpg", "sub_type": 0}]},
        {"message": [{"type": "image", "url": "https://x/3.jpg", "sub_type": 0}]},
    ]
    msg = {"message": [{"type": "text", "text": "看看"}]}
    settings = Settings(
        chat_vision_enabled=True,
        chat_vision_max_images=2,
        chat_vision_include_recent_on_refer=True,
    )
    urls = select_vision_urls(message=msg, recent=recent, settings=settings)
    assert urls == ["https://x/3.jpg", "https://x/2.jpg"]


def test_select_disabled_and_max():
    from src.chat.media.vision import select_vision_urls

    msg = {
        "message": [
            {"type": "image", "url": "https://x/a.jpg", "sub_type": 0},
            {"type": "image", "url": "https://x/b.jpg", "sub_type": 0},
            {"type": "image", "url": "https://x/c.jpg", "sub_type": 0},
        ]
    }
    off = select_vision_urls(
        message=msg, recent=[], settings=Settings(chat_vision_enabled=False)
    )
    assert off == []
    capped = select_vision_urls(
        message=msg,
        recent=[],
        settings=Settings(chat_vision_enabled=True, chat_vision_max_images=2),
    )
    assert capped == ["https://x/a.jpg", "https://x/b.jpg"]


def test_build_text_only_is_str():
    from src.chat.media.vision import build_user_content

    c = build_user_content("你好", [])
    assert c == "你好"


@pytest.mark.asyncio
async def test_build_messages_injects_image_url():
    mgr = MainlineManager(settings=Settings(chat_vision_enabled=True, chat_memory_enabled=False))
    req = ChatRequest(
        request_id="v1",
        session=SessionInfo(session_id="group:1:bot:2", group_id="1", bot_id="2"),
        message={
            "user_id": "100",
            "sender": {"nickname": "测试"},
            "raw_message": "看图",
            "message": [
                {"type": "text", "text": "看图"},
                {"type": "image", "url": "https://x/p.jpg", "sub_type": 0},
            ],
        },
        recent=[],
        hints=ChatHints(at_bot=True),
    )
    messages = await mgr._build_messages(req, mgr.get(req.session.session_id), "看图")
    assert isinstance(messages[0]["content"], str)
    content = messages[1]["content"]
    assert isinstance(content, list)
    assert content[0]["type"] == "text"
    assert "[图片 url=https://x/p.jpg]" in content[0]["text"]
    assert content[1]["type"] == "image_url"


@pytest.mark.asyncio
async def test_build_messages_includes_placeholders_in_llm_payload():
    captured: dict = {}

    async def fake_llm(messages, settings, *, abort_event=None):
        captured["messages"] = messages
        return '{"replies":[{"type":"text","text":"嗯"}]}'

    settings = Settings(
        llm_api_key="x",
        chat_memory_enabled=False,
        chat_vision_enabled=False,
        chat_sticker_reply_enabled=False,
        chat_heat_debounce_sec=0.05,
        chat_at_reaction_sec=(0.0, 0.0),
    )
    mgr = reset_mainline_manager_for_tests(MainlineManager(settings=settings, llm_complete=fake_llm))
    req = ChatRequest(
        request_id="ph1",
        session=SessionInfo(session_id="group:visph1:bot:2", group_id="visph1", bot_id="2"),
        message={
            "user_id": "100",
            "sender": {"nickname": "测试"},
            "raw_message": "看这个",
            "message": [
                {"type": "text", "text": "看这个 https://example.com/a"},
                {"type": "image", "url": "https://cdn.example/p.jpg", "sub_type": 0},
                {
                    "type": "image",
                    "url": "https://cdn.example/s.png",
                    "summary": "[动画表情]",
                    "sub_type": 1,
                },
            ],
        },
        recent=[
            {
                "user_id": "9",
                "sender": {"nickname": "甲"},
                "raw_message": "刚才",
                "message": [
                    {"type": "text", "text": "刚才"},
                    {"type": "image", "url": "https://cdn.example/old.jpg", "sub_type": 0},
                ],
            }
        ],
        hints=ChatHints(at_bot=True),
    )
    data = await mgr.handle(req)
    assert data.reason == "hold"
    import asyncio

    for _ in range(40):
        await asyncio.sleep(0.05)
        if mgr.drain_pending("group:visph1:bot:2"):
            break
    content = captured["messages"][1]["content"]
    text = content if isinstance(content, str) else content[0]["text"]
    assert "[图片 url=https://cdn.example/p.jpg]" in text
    assert "[表情包]" in text
    assert "[链接 https://example.com/a]" in text
