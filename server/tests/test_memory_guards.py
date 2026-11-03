from src.chat.memory.guards import (
    dedupe_existing_lines,
    filter_facts,
    filter_group_facts,
    filter_user_facts,
    is_bot_display_name,
    reject_reason,
    sanitize_display_name,
    validate_fact,
)


def test_reject_lore_and_secrets():
    assert reject_reason("攻击力 1200") is not None
    assert reject_reason("sk-abcdefghijklmnop") is not None
    assert reject_reason("persona.md 原文") is not None
    assert reject_reason("普罗米利亚设定") is not None
    assert reject_reason("activate_tools 用法") is not None


def test_reject_command_coaching():
    assert reject_reason("群内指令需要加~号前缀") is not None
    assert reject_reason("杂鱼，带~号啊：~绑定UID") is not None
    assert reject_reason("发指令前必须带~号，否则视为赖账") is not None


def test_allow_social():
    assert reject_reason("别叫他全名") is None
    assert reject_reason("群规：晚上别刷屏") is None
    assert validate_fact("喜欢奶茶")


def test_filter_facts():
    out = filter_facts(["喜欢猫", "攻击力999", "", "忌讳被@"])
    assert out == ["喜欢猫", "忌讳被@"]


def test_bot_display_name_blocked():
    assert is_bot_display_name("悠悠")
    assert is_bot_display_name("寒悠悠")
    assert is_bot_display_name("本小姐")
    assert sanitize_display_name("悠悠") == ""
    assert sanitize_display_name("惜阳别夕") == "惜阳别夕"


def test_filter_user_rejects_bot_self():
    out = filter_user_facts(
        [
            "喜欢猫",
            "悠悠自称没有主人",
            "不喜被拉着比较游戏优劣，只要联机有的玩就行",
            "别拉我比来比去",
        ]
    )
    assert out == ["喜欢猫"]


def test_filter_user_rejects_event_logs_and_ephemeral():
    from src.chat.memory.guards import is_junk_user_fact

    assert is_junk_user_fact("用户3476239275曾向用户2575547802发送请求")
    assert is_junk_user_fact("用户(3476239275)表示肚子很难受")
    assert is_junk_user_fact("被悠悠称为杂鱼")
    assert is_junk_user_fact("与悠悠有玩笑式斗嘴互动")
    assert not is_junk_user_fact("喜欢抹茶")
    assert not is_junk_user_fact("别叫杂鱼")
    assert not is_junk_user_fact("有发图不说话的习惯")
    out = filter_user_facts(
        [
            "想吃牛肉面",
            "用户(3476239275)自述十天半个月不洗澡",
            "被悠悠指出有刷屏习惯",
            "有发图不说话的习惯",
        ]
    )
    assert out == ["想吃牛肉面", "有发图不说话的习惯"]


def test_alias_with_youyou_stripped():
    assert sanitize_display_name("杂鱼悠悠") == ""
    assert sanitize_display_name("小长门") == "小长门"


def test_group_dedupe_and_noise():
    lines = dedupe_existing_lines(
        [
            "群内可用“杂鱼”作为调侃式回怼",
            "群内会用“杂鱼”互相调侃",
            "群内互相调侃时常用“杂鱼”一类玩笑称呼，气氛比较随意",
            "蓝原群不能发原神表情",
            "蓝原群不能发原神表情",
        ]
    )
    assert "蓝原群不能发原神表情" in lines
    # 氛围复读应被压掉或近重合并，不能堆三句杂鱼
    zayu = [x for x in lines if "杂鱼" in x]
    assert len(zayu) <= 1
