from src.chat.media.segments import MediaRef, format_sticker_label, render_media_placeholders


def test_format_labeled():
    ref = MediaRef(kind="sticker", url="https://x/a.gif")
    s = format_sticker_label(
        ref,
        tags={"ocr_text": "菜到安详", "emotion": ["自嘲", "摆烂"], "aliases": []},
    )
    assert "菜到安详" in s and "自嘲" in s


def test_format_unlabeled():
    assert format_sticker_label(MediaRef(kind="sticker", url="u")) == "[表情包]"


def test_render_uses_meta_tags():
    ref = MediaRef(
        kind="sticker",
        url="https://x/a.gif",
        meta={"tags": {"ocr_text": "哈哈", "emotion": ["笑"], "aliases": []}},
    )
    assert "哈哈" in render_media_placeholders([ref])
