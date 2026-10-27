from pathlib import Path

from src.chat.media.sticker_store import StickerStore, short_caption


def _store(tmp_path: Path, cap: int = 120) -> StickerStore:
    return StickerStore(tmp_path / "index.sqlite", cap=cap)


def test_upsert_then_search_by_emotion(tmp_path):
    store = _store(tmp_path)
    store.upsert(
        "aaa",
        "/stickers/aaa.png",
        {"emotion": ["无奈", "摆烂"], "scene": ["回嘴"], "ocr_text": "我不想干活", "aliases": ["摸鱼"]},
    )
    hits = store.search("无奈 摆烂", limit=5)
    assert hits
    assert hits[0]["hash"] == "aaa"
    assert hits[0]["path"] == "/stickers/aaa.png"


def test_search_scores_aliases_ocr_scene(tmp_path):
    store = _store(tmp_path)
    store.upsert("ocr", "/o.png", {"emotion": [], "scene": [], "ocr_text": "我不想干活", "aliases": []})
    store.upsert("alias", "/a.png", {"emotion": [], "scene": [], "ocr_text": "", "aliases": ["摸鱼"]})
    store.upsert("scene", "/s.png", {"emotion": [], "scene": ["结束话题"], "ocr_text": "", "aliases": []})
    store.upsert("miss", "/m.png", {"emotion": ["开心"], "scene": [], "ocr_text": "", "aliases": []})

    assert store.search("干活")[0]["hash"] == "ocr"
    assert store.search("摸鱼")[0]["hash"] == "alias"
    assert store.search("结束话题")[0]["hash"] == "scene"
    assert store.search("完全无关词xyz") == []


def test_mark_used_demotes_same_hash_within_10_min(tmp_path):
    store = _store(tmp_path)
    tags = {"emotion": ["无奈"], "scene": [], "ocr_text": "", "aliases": ["无奈"]}
    store.upsert("fresh", "/f.png", tags)
    store.upsert("used", "/u.png", tags)
    store.mark_used("used")
    ranked = store.search("无奈", limit=5)
    hashes = [row["hash"] for row in ranked]
    assert hashes[0] == "fresh"
    assert "used" in hashes


def test_library_cap_evicts_low_hits(tmp_path):
    store = _store(tmp_path, cap=2)
    store.upsert("a", "/a.png", {"emotion": ["a"], "scene": [], "ocr_text": "", "aliases": []})
    store.upsert("b", "/b.png", {"emotion": ["b"], "scene": [], "ocr_text": "", "aliases": []})
    store.upsert("a", "/a.png", {"emotion": ["a"], "scene": [], "ocr_text": "", "aliases": []})
    store.upsert("c", "/c.png", {"emotion": ["c"], "scene": [], "ocr_text": "", "aliases": []})
    hashes = {row["hash"] for row in store.search("a") + store.search("b") + store.search("c")}
    assert "a" in hashes
    assert "c" in hashes
    assert "b" not in hashes


def test_search_excludes_unlabeled_stub_and_skips_hit_bump(tmp_path):
    store = _store(tmp_path)
    stub = {
        "emotion": ["无奈"],
        "aliases": ["无奈"],
        "ocr_text": "__unlabeled__",
        "failed": True,
    }
    store.upsert("stub", "/s.png", stub)
    store.upsert("stub", "/s.png", stub)
    store.upsert("sentinel", "/t.png", {"ocr_text": "__unlabeled__"})
    store.upsert("ok", "/o.png", {"emotion": ["无奈"], "ocr_text": "", "aliases": []})
    hits = store.search("无奈")
    assert [row["hash"] for row in hits] == ["ok"]
    assert store.search("__unlabeled__") == []
    assert store.get("stub")["hits"] == 0
    assert store.get("sentinel")["hits"] == 0
    assert store.has_labeled("stub") is False
    assert store.get("ok")["hits"] == 1


def test_upsert_respects_cap_argument(tmp_path):
    store = _store(tmp_path, cap=50)
    store.upsert("a", "/a.png", {"emotion": ["a"]}, cap=1)
    store.upsert("b", "/b.png", {"emotion": ["b"]}, cap=1)
    assert store.get("a") is None
    assert store.get("b") is not None
    assert store._cap == 1


def test_evict_deletes_file_only_under_sticker_files(tmp_path, monkeypatch):
    from src.chat.media import sticker_store as mod

    files = tmp_path / "files"
    files.mkdir()
    monkeypatch.setattr(mod, "_sticker_files_root", lambda: files)
    drop = files / "drop.png"
    keep = files / "keep.png"
    outside = tmp_path / "outside.png"
    drop.write_bytes(b"d")
    keep.write_bytes(b"k")
    outside.write_bytes(b"o")
    store = mod.StickerStore(tmp_path / "index.sqlite", cap=1)
    store.upsert("drop", str(drop), {"emotion": ["d"]})
    store.upsert("out", str(outside), {"emotion": ["o"]})
    assert store.get("drop") is None
    assert not drop.exists()
    assert outside.exists()
    store.upsert("keep", str(keep), {"emotion": ["k"]}, cap=1)
    assert store.get("out") is None
    assert outside.exists()
    assert keep.exists()
    assert store.get("keep") is not None


def test_default_store_rereads_library_cap(tmp_path, monkeypatch):
    from src.chat.media import sticker_store as mod

    monkeypatch.setattr(mod, "DEFAULT_INDEX", tmp_path / "index.sqlite")
    monkeypatch.setattr(mod, "_default", None)

    class _Settings:
        chat_sticker_library_cap = 5

    settings = _Settings()
    store = mod.default_store(settings)
    assert store._cap == 5
    settings.chat_sticker_library_cap = 2
    again = mod.default_store(settings)
    assert again is store
    assert store._cap == 2


def test_has_labeled_false_until_tags(tmp_path):
    store = _store(tmp_path)
    assert store.get("x") is None
    store.upsert("x", "/x.png", {})
    row = store.get("x")
    assert row is not None
    assert store.has_labeled("x") is False
    store.upsert("x", "/x.png", {"emotion": ["笑"], "scene": [], "ocr_text": "", "aliases": []})
    assert store.has_labeled("x") is True


def test_short_caption_prefers_ocr():
    assert short_caption({"ocr_text": "菜到安详", "emotion": ["摆烂"]}) == "菜到安详"
    assert short_caption({"emotion": ["无奈"], "aliases": []}) == "无奈"


def test_shelf_skips_unlabeled_and_respects_limit(tmp_path):
    store = _store(tmp_path, cap=20)
    store.upsert(
        "h1",
        str(tmp_path / "a.gif"),
        {"emotion": ["笑"], "ocr_text": "哈哈", "aliases": [], "scene": [], "usable_for": []},
    )
    store.upsert(
        "h2",
        str(tmp_path / "b.gif"),
        {
            "failed": True,
            "ocr_text": "__unlabeled__",
            "emotion": [],
            "aliases": [],
            "scene": [],
            "usable_for": [],
        },
    )
    shelf = store.shelf(limit=5)
    assert [x["hash"] for x in shelf] == ["h1"]
    assert shelf[0]["caption"] == "哈哈"
    assert shelf[0]["score"] >= 2.0
    assert store.shelf(limit=5, exclude_hashes={"h1"}) == []
