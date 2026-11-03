from pathlib import Path

from src.chat.memory.store import reset_memory_store_for_tests


def test_users_memory_slang_session(tmp_path: Path):
    store = reset_memory_store_for_tests(tmp_path)
    gid = "g1"

    assert store.load_group_profile(gid) == ""
    assert store.append_group_facts(gid, ["群规：晚上别刷屏", "攻击力999"]) == 1
    assert "群规" in store.load_group_profile(gid)
    assert "攻击力" not in store.load_group_profile(gid)

    store.update_user(
        gid,
        "u1",
        {"nickname": "小明", "preferences": ["喜欢奶茶"], "taboos": ["别叫全名"]},
    )
    u = store.load_user(gid, "u1")
    assert u["nickname"] == "小明"
    assert "喜欢奶茶" in u["preferences"]

    assert store.upsert_slang(gid, "躺平", "不想干活", ["今天躺平了"])
    slang = store.load_slang(gid)
    assert slang and slang[0]["term"] == "躺平"
    assert store.upsert_slang(gid, "躺平", "继续摸鱼")
    slang2 = store.load_slang(gid)
    assert slang2[0]["hits"] == 2
    assert slang2[0]["meaning"] == "继续摸鱼"

    store.append_session(gid, user_id="u1", user_text="你好", bot_replies=["嗨"], max_turns=3)
    store.append_session(gid, user_id="u1", user_text="二", bot_replies=["嗯"], max_turns=3)
    store.append_session(gid, user_id="u1", user_text="三", bot_replies=["好"], max_turns=3)
    store.append_session(gid, user_id="u1", user_text="四", bot_replies=["行"], max_turns=3)
    sess = store.load_session(gid, max_turns=10)
    assert len(sess) == 3
    assert sess[-1]["user_text"] == "四"

    assert store.append_daily_note(gid, "今天聊了奶茶")
    assert "奶茶" in store.load_daily(gid)

    msg = store.remember_manual(gid, "u1", "我喜欢早起")
    assert "画像" in msg
    assert any("早起" in n for n in store.load_user(gid, "u1")["notes"])

    store.append_group_facts(gid, ["临时约定XYZ"])
    assert "移除" in store.forget_manual(gid, "临时约定XYZ")
