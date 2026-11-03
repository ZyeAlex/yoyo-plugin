from src.chat.should_respond import decide, is_game_command


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
    from src.chat.help_capabilities import capability_block, reset_help_cache_for_tests

    reset_help_cache_for_tests()
    # config.yaml rulePrefix[0] 当前是 ~
    assert is_game_command("~角色图鉴")
    assert is_game_command("#角色图鉴")
    assert is_game_command("~签到")
    assert is_game_command("#签到")
    assert is_game_command("~芙宁娜图鉴")
    assert not is_game_command("[图片]")
    assert not is_game_command("")
    assert not is_game_command("晚上吃什么好呢？")
    action, reason = decide(hints_at_bot=True, text="~角色图鉴")
    assert action == "skip"
    assert reason == "game_command"

    caps = capability_block()
    assert "~角色图鉴" in caps
    assert "#角色图鉴" not in caps
    assert "不需要 @你" in caps or "不需要 @悠悠" in caps
    assert "指令前缀是「~」" in caps
    assert "少个~" in caps
    assert "不要当老师" in caps


def test_bot_name_in_text():
    action, reason = decide(text="悠悠帮我看看", bot_names=["悠悠", "小悠"])
    assert action == "reply"
    assert reason == "bot_name"


def test_question_no_longer_proactive():
    """问句不再靠启发式立刻开口，交给热度攒批。"""
    action, reason = decide(text="晚上吃什么好呢？")
    assert action == "skip"
    assert reason == "no_trigger"


def test_greeting_no_longer_proactive():
    action, reason = decide(text="晚上好")
    assert action == "skip"
    assert reason == "no_trigger"
