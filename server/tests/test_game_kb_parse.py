from src.chat.llm import parse_persona_json


def test_parse_lookup_and_expand_bubbles():
    raw = '''{"engagement":"hold","replies":[
      {"type":"text","text":"稍等"},
      {"type":"lookup","kind":"hero","q":"寒悠悠"},
      {"type":"expand","from_kind":"suit","id":"1","edges":["relatedPet"]}
    ]}'''
    bubbles, eng = parse_persona_json(raw, max_replies=2)
    assert eng == "hold"
    types = [b.get("type") for b in bubbles]
    assert "lookup" in types and "expand" in types
    look = next(b for b in bubbles if b["type"] == "lookup")
    assert look["kind"] == "hero" and look["q"] == "寒悠悠"
