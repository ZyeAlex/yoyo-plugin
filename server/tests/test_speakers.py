from src.chat.speakers import (
    collect_cast,
    format_bot_line,
    format_message_line,
    parse_speaker_line,
    role_label,
)


def test_role_label():
    assert role_label("owner") == "群主"
    assert role_label("admin") == "管理"
    assert role_label("member") == "群成员"
    assert role_label("") == "群成员"


def test_format_message_line_has_qq_role_nick():
    msg = {
        "user_id": "3476239275",
        "sender": {"nickname": "小长门", "card": "小长门", "role": "admin"},
    }
    line = format_message_line(msg, "你好")
    assert line == "3476239275 管理 小长门: 你好"


def test_format_bot_line():
    line = format_bot_line("嗯", bot_id="2575547802", bot_nickname="悠悠")
    assert line == "2575547802 群成员 悠悠: 嗯"


def test_parse_speaker_line():
    p = parse_speaker_line("3476239275 管理 小长门: 嗨")
    assert p and p["qq"] == "3476239275" and p["role"] == "管理" and p["nickname"] == "小长门"


def test_collect_cast_puts_self_first():
    cast = collect_cast(
        message={
            "user_id": "1",
            "sender": {"nickname": "甲", "role": "owner"},
            "message": [{"type": "at", "qq": "2", "name": "乙"}],
        },
        recent=[{"user_id": "3", "sender": {"nickname": "丙", "role": "member"}}],
        bot_id="99",
        bot_nickname="悠悠",
        max_cast=8,
    )
    assert cast[0].is_self and cast[0].user_id == "99"
    ids = [c.user_id for c in cast]
    assert ids[:4] == ["99", "1", "2", "3"]
