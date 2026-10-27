from src.chat.should_respond import decide, is_draw_intent, is_game_command


def test_decide_at_bot_with_empty_text_still_replies():
    """纯媒体 + @ 不再因 media_only 跳过。"""
    action, reason = decide(hints_at_bot=True, text="")
    assert action == "reply"
    assert reason == "at_bot"


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
    action, reason = decide(text="今天天气不错啊哈哈哈哈哈哈哈哈哈哈")
    assert action == "skip"
    assert reason == "no_trigger"


def test_game_command_skip():
    assert is_game_command("#角色图鉴")
    assert not is_game_command("[图片]")
    assert not is_game_command("")
    action, reason = decide(hints_at_bot=True, text="#角色图鉴")
    assert action == "skip"
    assert reason == "game_command"


def test_bot_name_in_text():
    action, reason = decide(text="悠悠帮我看看", bot_names=["悠悠", "小悠"])
    assert action == "reply"
    assert reason == "bot_name"


def test_proactive_question():
    action, reason = decide(text="晚上吃什么好呢？", proactive_enabled=True, last_bot_reply_at=0)
    assert action == "reply"
    assert reason == "proactive_question"


def test_proactive_cooldown():
    now = 1000.0
    action, reason = decide(
        text="在吗",
        proactive_enabled=True,
        last_bot_reply_at=990.0,
        proactive_cooldown_sec=45,
        now=now,
    )
    assert action == "skip"
    assert reason == "proactive_cooldown"


def test_proactive_disabled():
    action, reason = decide(text="晚上好", proactive_enabled=False)
    assert action == "skip"


def test_draw_intent():
    assert is_draw_intent("帮我画一只猫")
    assert not is_draw_intent("今天天气真好")
