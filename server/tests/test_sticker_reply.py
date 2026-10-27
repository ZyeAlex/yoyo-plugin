from pathlib import Path

import pytest

from src.chat.llm import parse_replies_json
from src.chat.mainline import (
    MainlineManager,
    ShelfItem,
    build_sticker_shelf,
    format_shelf_prompt,
    reset_mainline_manager_for_tests,
    resolve_sticker_bubbles,
    wants_dou_tu,
)
from src.chat.schema import ChatHints, ChatRequest, ReplyBubble, SessionInfo
from src.core.settings import Settings

_SERVER = Path(__file__).resolve().parents[1]
_OK_STICKER = str((_SERVER / "data" / "stickers" / "files" / "h1.webp").resolve())
_OK_MEDIA = str((_SERVER / "data" / "media" / "pic.jpg").resolve())


class FakeStore:
    def __init__(self, hits=None, shelf_hits=None):
        self.hits = (
            hits
            if hits is not None
            else [
                {
                    "hash": "h1",
                    "path": _OK_STICKER,
                    "score": 3.0,
                    "caption": "无奈",
                    "tags": {"emotion": ["无奈"], "ocr_text": "无奈", "aliases": []},
                }
            ]
        )
        self.shelf_hits = shelf_hits
        self.queries: list[str] = []
        self.used: list[str] = []

    def search(self, query: str, *, limit: int = 5):
        self.queries.append(query)
        return list(self.hits)[:limit]

    def shelf(self, *, limit: int = 5, exclude_hashes=None):
        skip = set(exclude_hashes or [])
        src = self.hits if self.shelf_hits is None else self.shelf_hits
        out = []
        for h in src:
            if h.get("hash") in skip:
                continue
            item = dict(h)
            item.setdefault("score", 2.0)
            item.setdefault("caption", "表情")
            out.append(item)
            if len(out) >= limit:
                break
        return out

    def mark_used(self, hash: str) -> None:
        self.used.append(hash)


def _req(*, text: str, at_bot: bool = True, recent=None, message=None) -> ChatRequest:
    msg = message or {
        "user_id": "100",
        "sender": {"nickname": "测试"},
        "raw_message": text,
        "message": [{"type": "text", "text": text}],
    }
    return ChatRequest(
        request_id="sticker-1",
        session=SessionInfo(session_id="group:1:bot:2", group_id="1", bot_id="2"),
        message=msg,
        recent=recent or [],
        hints=ChatHints(at_bot=at_bot),
    )


async def _sticker_llm(messages, settings, *, abort_event=None):
    return '{"replies":[{"type":"text","text":"来啊"},{"type":"sticker","id":"s1"}]}'


async def _text_only_llm(messages, settings, *, abort_event=None):
    return '{"replies":[{"type":"text","text":"哈哈"}]}'


def test_parse_replies_json_accepts_sticker_id():
    raw = '{"replies":[{"type":"text","text":"来啊"},{"type":"sticker","id":"s1"}]}'
    out = parse_replies_json(raw, max_replies=1)
    assert any(b.get("type") == "sticker" and b.get("id") == "s1" for b in out)
    assert any(b.get("type") == "text" and b.get("text") == "来啊" for b in out)


def test_wants_dou_tu_from_text_or_sticker_refs():
    assert wants_dou_tu(text="来张表情包", message={}, recent=[]) is True
    assert wants_dou_tu(text="接一个", message={}, recent=[]) is True
    assert wants_dou_tu(text="斗图", message={}, recent=[]) is True
    assert wants_dou_tu(
        text="看看",
        message={
            "message": [
                {"type": "image", "url": "https://x/a.jpg", "summary": "[动画表情]", "sub_type": 1}
            ]
        },
        recent=[],
    ) is True
    assert wants_dou_tu(text="你好呀", message={}, recent=[]) is False


def test_build_sticker_shelf_only_when_dou_tu():
    store = FakeStore()
    settings = Settings(chat_sticker_shelf_enabled=True, chat_sticker_reply_enabled=True)
    assert build_sticker_shelf(store, settings, text="你好", message={}, recent=[]) == []
    items = build_sticker_shelf(store, settings, text="发个表情包", message={}, recent=[])
    assert len(items) >= 1
    assert items[0].id == "s1"
    assert "可发表情" in format_shelf_prompt(items)


def test_resolve_by_shelf_id():
    settings = Settings(chat_sticker_reply_enabled=True, chat_sticker_max_per_reply=1)
    items = [ShelfItem(id="s1", hash="h1", path=_OK_STICKER, caption="无奈", emotions=["无奈"])]
    store = FakeStore()
    replies = resolve_sticker_bubbles(
        [{"type": "text", "text": "来啊"}, {"type": "sticker", "id": "s1"}],
        store,
        settings,
        shelf_items=items,
    )
    assert replies[0] == ReplyBubble(type="text", text="来啊")
    assert any(r.type == "image" and r.path == _OK_STICKER and r.sticker_desc == "无奈" for r in replies)
    assert store.used == ["h1"]


def test_resolve_none_or_missing_does_not_auto_send():
    settings = Settings(chat_sticker_reply_enabled=True, chat_sticker_max_per_reply=1)
    items = [ShelfItem(id="s1", hash="h1", path=_OK_STICKER, caption="无奈", emotions=[])]
    store = FakeStore()
    out = resolve_sticker_bubbles(
        [{"type": "text", "text": "遵命这就发"}, {"type": "sticker", "id": "none"}],
        store,
        settings,
        shelf_items=items,
    )
    assert all(r.type != "image" for r in out)
    assert store.used == []

    omitted = resolve_sticker_bubbles(
        [{"type": "text", "text": "遵命老板！这就给你整一个"}],
        store,
        settings,
        shelf_items=items,
    )
    assert all(r.type != "image" for r in omitted)


def test_resolve_skips_when_disabled_or_bad_id():
    store = FakeStore()
    items = [ShelfItem(id="s1", hash="h1", path=_OK_STICKER, caption="无奈", emotions=[])]
    off = resolve_sticker_bubbles(
        [{"type": "sticker", "id": "s1"}],
        store,
        Settings(chat_sticker_reply_enabled=False),
        shelf_items=items,
    )
    assert off == []
    bad = resolve_sticker_bubbles(
        [{"type": "text", "text": "hi"}, {"type": "sticker", "id": "s99"}],
        store,
        Settings(chat_sticker_reply_enabled=True),
        shelf_items=items,
    )
    assert bad == [ReplyBubble(type="text", text="hi")]


@pytest.mark.asyncio
async def test_generate_resolves_sticker_id_to_image():
    settings = Settings(
        llm_api_key="x",
        max_replies=1,
        chat_sticker_reply_enabled=True,
        chat_sticker_shelf_enabled=True,
        chat_memory_enabled=False,
    )
    store = FakeStore()
    mgr = reset_mainline_manager_for_tests(
        MainlineManager(settings=settings, llm_complete=_sticker_llm, sticker_store=store)
    )
    data = await mgr.handle(_req(text="来张表情包"))
    assert data.action == "reply"
    assert any(r.type == "image" and r.path == _OK_STICKER for r in data.replies)
    assert any(r.type == "text" and r.text == "来啊" for r in data.replies)
    assert "sticker" not in {r.type for r in data.replies}
    assert store.used == ["h1"]


@pytest.mark.asyncio
async def test_generate_text_only_does_not_auto_send_sticker():
    settings = Settings(
        llm_api_key="x",
        max_replies=1,
        chat_sticker_reply_enabled=True,
        chat_sticker_shelf_enabled=True,
        chat_memory_enabled=False,
    )
    store = FakeStore()
    mgr = reset_mainline_manager_for_tests(
        MainlineManager(settings=settings, llm_complete=_text_only_llm, sticker_store=store)
    )
    data = await mgr.handle(_req(text="来张表情包"))
    assert any(r.type == "text" for r in data.replies)
    assert all(r.type != "image" for r in data.replies)
    assert store.used == []


def test_resolve_confines_image_paths():
    settings = Settings(chat_sticker_reply_enabled=True, chat_sticker_max_per_reply=1)
    outside = resolve_sticker_bubbles(
        [{"type": "sticker", "id": "s1"}],
        FakeStore(),
        settings,
        shelf_items=[ShelfItem(id="s1", hash="h1", path="/tmp/sticker.webp", caption="x", emotions=[])],
    )
    assert outside == []

    kept = resolve_sticker_bubbles(
        [{"type": "image", "path": _OK_MEDIA}, {"type": "image", "path": _OK_STICKER}],
        FakeStore(hits=[]),
        settings,
        shelf_items=[],
    )
    assert [r.path for r in kept] == [_OK_MEDIA, _OK_STICKER]
