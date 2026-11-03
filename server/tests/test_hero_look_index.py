import json

from src.chat.hero_look.index import hero_img_candidates, load_hero_img_index, pick_hero_img
from src.chat.hero_look.paths import hero_imgs_index_path


class _Fixed:
    def choice(self, seq):
        return seq[0]


def test_index_path_under_data_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "src.chat.hero_look.paths._PLUGIN_ROOT",
        tmp_path,
    )
    p = hero_imgs_index_path()
    assert p == tmp_path / "data" / "cache" / "hero_imgs.json"


def test_pick_filters_non_images_and_missing(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.hero_look.paths._PLUGIN_ROOT", tmp_path)
    img = tmp_path / "a.png"
    img.write_bytes(b"x")
    junk = tmp_path / "notes.txt"
    junk.write_text("nope", encoding="utf-8")
    index_path = tmp_path / "data" / "cache" / "hero_imgs.json"
    index_path.parent.mkdir(parents=True)
    index_path.write_text(
        json.dumps({"101003": [str(junk), str(img), str(tmp_path / "gone.jpg")]}),
        encoding="utf-8",
    )
    assert load_hero_img_index()["101003"]
    picked = pick_hero_img("101003", rng=_Fixed())
    assert picked == str(img.resolve())
    assert pick_hero_img("999999") is None


def _png(w: int, h: int) -> bytes:
    import struct
    import zlib

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)


def test_candidates_prefer_portrait(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.hero_look.paths._PLUGIN_ROOT", tmp_path)
    wide = tmp_path / "wide.png"
    tall = tmp_path / "tall.png"
    wide.write_bytes(_png(800, 400))
    tall.write_bytes(_png(400, 700))
    index_path = tmp_path / "data" / "cache" / "hero_imgs.json"
    index_path.parent.mkdir(parents=True)
    index_path.write_text(
        json.dumps({"101003": [str(wide), str(tall)]}),
        encoding="utf-8",
    )
    cands = hero_img_candidates("101003", limit=2)
    assert cands
    assert cands[0].endswith("tall.png")
