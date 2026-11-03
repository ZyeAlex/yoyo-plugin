from src.chat.llm import parse_persona_json


def test_parse_look_and_draw_use_ref():
    raw = '''{"engagement":"hold","replies":[
      {"type":"look","q":"self"},
      {"type":"text","text":"稍等"},
      {"type":"draw","prompt":"赛博街头","use_ref":true}
    ]}'''
    bubbles, eng = parse_persona_json(raw, max_replies=1)
    assert eng == "hold"
    look = next(b for b in bubbles if b["type"] == "look")
    assert look["q"] == "self"
    draw = next(b for b in bubbles if b["type"] == "draw")
    assert draw["use_ref"] is True
    assert draw["prompt"] == "赛博街头"
    assert sum(1 for b in bubbles if b["type"] == "text") == 1


def test_look_does_not_eat_text_budget():
    raw = '''{"engagement":"hold","replies":[
      {"type":"look","q":"寒悠悠"},
      {"type":"text","text":"一"},
      {"type":"text","text":"二"}
    ]}'''
    bubbles, _ = parse_persona_json(raw, max_replies=1)
    assert any(b["type"] == "look" for b in bubbles)
    texts = [b for b in bubbles if b["type"] == "text"]
    assert len(texts) == 1
