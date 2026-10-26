from src.chat.should_respond import decide, is_game_command


def test_at_bot_reply():
    action, reason = decide(hints_at_bot=True, text="你好")
    assert action == "reply"
    assert reason == "at_bot"


def test_wake_word_reply():
    action, reason = decide(hints_wake_word=True, text="悠悠在吗")
    assert action == "reply"
    assert reason == "wake_word"


def test_reply_to_bot():
    action, reason = decide(hints_reply_to_bot=True, text="接着说")
    assert action == "reply"
    assert reason == "reply_to_bot"


def test_plain_skip():
    action, reason = decide(text="今天天气不错")
    assert action == "skip"
    assert reason == "no_trigger"


def test_game_command_skip():
    assert is_game_command("#角色图鉴")
    action, reason = decide(hints_at_bot=True, text="#角色图鉴")
    assert action == "skip"
    assert reason == "game_command"


def test_bot_name_in_text():
    action, reason = decide(text="悠悠帮我看看", bot_names=["悠悠", "小悠"])
    assert action == "reply"
    assert reason == "bot_name"
