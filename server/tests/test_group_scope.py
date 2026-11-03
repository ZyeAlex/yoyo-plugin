from src.chat.group_scope import group_scope_note, is_xingyuan_group


def test_mark_is_substring_of_group_name():
    assert is_xingyuan_group("【蓝色星原】旅谣")
    assert is_xingyuan_group("蓝色星原")
    assert not is_xingyuan_group("81138585")
    assert not is_xingyuan_group("")
    assert not is_xingyuan_group(None)


def test_note_is_only_the_group_name():
    note = group_scope_note("普通群")
    assert note == "【本群】群名：普通群。"
    assert "作废" not in note
    assert group_scope_note("蓝色星原·一群") == "【本群】群名：蓝色星原·一群。"
