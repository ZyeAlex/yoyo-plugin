from src.chat.media.segments import (
    effective_text,
    has_meaningful_text,
    parse_message_segments,
    render_media_placeholders,
)


def test_parse_image_and_text():
    msg = {
        "message": [
            {"type": "text", "text": "看看"},
            {"type": "image", "url": "https://x/a.jpg", "summary": "[动画表情]", "sub_type": 1},
        ],
        "raw_message": "看看[动画表情]",
    }
    refs = parse_message_segments(msg)
    assert any(r.kind == "sticker" for r in refs)
    assert effective_text(msg) == "看看"
    assert has_meaningful_text(msg) is True


def test_pure_image_no_meaningful_text():
    msg = {"message": [{"type": "image", "url": "https://x/a.jpg"}], "raw_message": "[图片]"}
    assert has_meaningful_text(msg) is False


def test_render_placeholder():
    from src.chat.media.segments import MediaRef
    s = render_media_placeholders([MediaRef(kind="photo", url="https://x/a.jpg", path="", summary="", face_id="", meta={})])
    assert "https://x/a.jpg" in s
