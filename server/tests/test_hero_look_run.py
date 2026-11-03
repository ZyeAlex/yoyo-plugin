import json
from pathlib import Path

from src.chat.hero_look.resolve_q import resolve_look_query
from src.chat.hero_look.run import run_look


def test_resolve_self_and_empty(monkeypatch):
    monkeypatch.setattr(
        "src.chat.hero_look.resolve_q.get_record",
        lambda kind, eid: {"id": eid, "name": "寒悠悠"} if eid == "101003" else None,
    )
    assert resolve_look_query("self", self_hero_id="101003") == ("101003", "寒悠悠")
    assert resolve_look_query("", self_hero_id="101003") == ("101003", "寒悠悠")


def test_resolve_by_name(monkeypatch):
    monkeypatch.setattr(
        "src.chat.hero_look.resolve_q.resolve_name",
        lambda q: [("hero", "101003")] if q == "寒悠悠" else [],
    )
    monkeypatch.setattr(
        "src.chat.hero_look.resolve_q.get_record",
        lambda kind, eid: {"id": "101003", "name": "寒悠悠"},
    )
    assert resolve_look_query("寒悠悠", self_hero_id="101003")[0] == "101003"


def test_run_look_ok_no_path_in_result(tmp_path, monkeypatch):
    img = tmp_path / "h.png"
    img.write_bytes(b"png")
    monkeypatch.setattr("src.chat.hero_look.paths._PLUGIN_ROOT", tmp_path)
    monkeypatch.setattr(
        "src.chat.hero_look.run.resolve_look_query",
        lambda q, self_hero_id="101003": ("101003", "寒悠悠"),
    )
    monkeypatch.setattr("src.chat.hero_look.run.pick_hero_img", lambda hid, **kw: str(img))
    monkeypatch.setattr(
        "src.chat.hero_look.run.weak_desc",
        lambda hid, name: f"{name} 短描述",
    )
    result, pending = run_look(
        {"type": "look", "q": "self"}, self_hero_id="101003", session_id="g1"
    )
    assert result["ok"] is True
    assert result["ref_available"] is True
    assert result["kind"] == "hero_look"
    assert "path" not in result
    blob = json.dumps(result, ensure_ascii=False)
    assert str(img) not in blob
    assert pending is not None
    assert Path(pending["path"]).is_file()
    assert pending["hero_id"] == "101003"


def test_run_look_resolve_miss(monkeypatch):
    monkeypatch.setattr(
        "src.chat.hero_look.run.resolve_look_query",
        lambda q, self_hero_id="101003": None,
    )
    result, pending = run_look({"type": "look", "q": "不存在"}, self_hero_id="101003")
    assert result["ok"] is False
    assert result["ref_available"] is False
    assert pending is None


def test_run_look_no_local_img(monkeypatch):
    monkeypatch.setattr(
        "src.chat.hero_look.run.resolve_look_query",
        lambda q, self_hero_id="101003": ("101003", "寒悠悠"),
    )
    monkeypatch.setattr("src.chat.hero_look.run.pick_hero_img", lambda hid, **kw: None)
    result, pending = run_look({"type": "look", "q": "self"}, self_hero_id="101003")
    assert result["ok"] is False
    assert result["id"] == "101003"
    assert result["ref_available"] is False
    assert pending is None
