from datetime import datetime, timezone

from src.chat.transcript import (
    append_transcript,
    format_now,
    load_transcript_since_bot,
    stamp_line,
    unstamp_line,
)


def test_since_bot_keeps_unread_after_last_reply(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.transcript.group_dir", lambda gid: tmp_path / gid)
    gid = "g1"
    append_transcript(gid, "甲: 早")
    append_transcript(gid, "悠悠: 早呀")
    for i in range(25):
        append_transcript(gid, f"甲: 离场话{i}")
    lines = load_transcript_since_bot(gid, max_lines=100, max_chars=5000, keep_before=2)
    assert any("悠悠: 早呀" in x for x in lines)
    assert any("离场话24" in x for x in lines)
    assert any("离场话0" in x for x in lines)
    assert not lines[-1].startswith("[")
    timed = load_transcript_since_bot(
        gid, max_lines=100, max_chars=5000, keep_before=2, with_time=True
    )
    assert timed[-1].startswith("[")
    assert "甲: 离场话24" in timed[-1]


def test_stamp_uses_shanghai_clock():
    raw = "2026-10-28T09:32:00Z"
    assert stamp_line("甲: 早", raw) == "[10-28 17:32] 甲: 早"
    assert format_now(raw) == "2026-10-28 17:32 周三"
    assert unstamp_line("[10-28 17:32] 甲: 早") == "甲: 早"
    assert stamp_line("甲: 早", None) == "甲: 早"
    unix = datetime(2026, 10, 28, 9, 32, tzinfo=timezone.utc).timestamp()
    assert stamp_line("乙: 晚", unix) == "[10-28 17:32] 乙: 晚"
