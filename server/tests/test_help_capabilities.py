from src.chat.help_capabilities import (
    capability_block,
    is_game_command,
    reset_help_cache_for_tests,
)


def setup_function():
    reset_help_cache_for_tests()


def test_capability_block_lists_help_groups():
    text = capability_block()
    assert "星原图鉴" in text
    assert "~角色图鉴" in text
    assert "#角色图鉴" not in text
    assert "签到" in text
    assert "lookup" in text
    assert "整页图鉴" in text


def test_commands_derived_from_help():
    assert is_game_command("#角色图鉴")
    assert is_game_command("～签到")
    assert is_game_command("#绑定UID")
    assert is_game_command("#寒悠悠技能")
    assert is_game_command("#某某角色攻略")
    assert is_game_command("#上传夜夜图片")
    assert is_game_command("寒悠悠图片15")
    assert is_game_command("~寒悠悠图片16")
    assert is_game_command("@2575547802 寒悠悠图片15")
    assert not is_game_command("帮我画一只猫")
    assert not is_game_command("我想看看角色图鉴")
    assert not is_game_command("某某角色攻略")  # 模板类必须带 #
