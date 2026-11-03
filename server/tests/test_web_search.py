import base64
import json

from src.chat.llm import parse_persona_json
from src.chat.web_search.fetch import fetch_page, is_public_http_url
from src.chat.web_search.ops import model_search_payload, run_web_ops
from src.chat.web_search.search import (
    CompositeSearch,
    engines_for,
    unwrap_bing_url,
)

_BING_TARGET = "https://example.com/bing"


def _bing_href(url: str = _BING_TARGET) -> str:
    token = base64.urlsafe_b64encode(url.encode()).decode().rstrip("=")
    return f"https://www.bing.com/ck/a?!&&p=1&u=a1{token}&ntb=1"


def _bing_html(snippet: str = "天气  很好\n今天", *, n: int = 2) -> str:
    blocks = [
        f"""
        <li class="b_algo">
          <h2><a href="{_bing_href()}">必应标题</a></h2>
          <div class="b_caption"><p>{snippet}</p></div>
        </li>
        """
    ]
    if n >= 2:
        blocks.append(
            """
            <li class="b_algo">
              <h2><a href="https://example.com/direct">直链</a></h2>
              <p>只有 p</p>
            </li>
            """
        )
    for i in range(2, n):
        blocks.append(
            f"""
            <li class="b_algo">
              <h2><a href="https://example.com/r{i}">t{i}</a></h2>
              <div class="b_caption"><p>s{i}</p></div>
            </li>
            """
        )
    return "\n".join(blocks)


def test_engines_bing_only():
    assert engines_for(None) == ["bing"]
    assert engines_for("general") == ["bing"]
    assert engines_for("privacy") == ["bing"]
    assert engines_for("finance") == ["bing"]


def test_unwrap_bing_redirect():
    assert unwrap_bing_url(_bing_href()) == _BING_TARGET
    assert unwrap_bing_url("https://www.bing.com/ck/a?u=a1%%%") == ""


def test_search_bing_only_parses_and_dedups():
    calls: list[str] = []

    def fetcher(url: str) -> str:
        calls.append(url)
        return _bing_html() + f"""
        <li class="b_algo">
          <h2><a href="{_bing_href()}">重复必应</a></h2>
          <div class="b_caption"><p>同链接</p></div>
        </li>
        """

    out = CompositeSearch(fetcher).search("天气", "general", 10)
    assert len(calls) == 1
    assert "bing.com/search" in calls[0] and "setlang=zh-hans" in calls[0]
    assert "duckduckgo" not in calls[0]
    assert out["query_analysis"]["engines"] == ["bing"]
    urls = [row["url"] for row in out["aggregated_results"]]
    assert urls == [_BING_TARGET, "https://example.com/direct"]
    assert out["aggregated_results"][0]["snippet"] == "天气 很好 今天"
    assert out["aggregated_results"][0]["source_engine"] == "bing"
    assert out["aggregated_results"][0]["confidence_score"] == 1.0
    assert out["aggregated_results"][1]["snippet"] == "只有 p"


def test_bing_failure_returns_error():
    def fetcher(url: str) -> str:
        raise RuntimeError("bing down")

    out = CompositeSearch(fetcher).search("天气", None, 5)
    assert out["aggregated_results"] == []
    assert out["metadata"]["errors"]
    assert "bing" in out["metadata"]["errors"][0]


def test_empty_query_skips_network():
    called = {"n": 0}

    def fetcher(url: str) -> str:
        called["n"] += 1
        return _bing_html()

    out = CompositeSearch(fetcher).search("  ", None, 10)
    assert called["n"] == 0
    assert out["metadata"]["errors"] == ["empty query"]
    assert out["aggregated_results"] == []


def test_confidence_floors_at_035():
    out = CompositeSearch(lambda url: _bing_html(n=16)).search("q", None, 20)
    scores = [row["confidence_score"] for row in out["aggregated_results"]]
    assert scores[0] == 1.0
    assert scores[1] == 0.95
    assert scores[13] == 0.35
    assert scores[15] == 0.35
    assert len(scores) == 16


def test_max_results_clamped():
    search = CompositeSearch(lambda url: _bing_html(n=3))
    assert len(search.search("q", None, 1)["aggregated_results"]) == 1
    assert len(search.search("q", None, 0)["aggregated_results"]) == 1
    assert len(search.search("q", None, 80)["aggregated_results"]) == 3


def test_model_payload_renames_fields_and_drops_blank():
    payload = model_search_payload(
        {
            "aggregated_results": [
                {
                    "title": "天气",
                    "url": "https://example.com/a",
                    "snippet": "晴",
                    "confidence_score": 1.0,
                    "source_engine": "bing",
                },
                {"title": "", "url": "https://example.com/x", "snippet": "丢"},
                {"title": "无链接", "url": "", "snippet": "丢"},
            ],
            "query_analysis": {"query": "天气", "intent": None, "engines": ["bing"]},
            "metadata": {"result_count": 1, "errors": []},
        }
    )
    assert payload["ok"] is True
    assert payload["results"] == [
        {
            "title": "天气",
            "url": "https://example.com/a",
            "content": "晴",
            "score": 1.0,
            "source_engine": "bing",
        }
    ]
    assert "snippet" not in payload["results"][0]
    assert "hint" not in payload


def test_model_payload_empty_says_failure():
    payload = model_search_payload(
        {
            "aggregated_results": [],
            "query_analysis": {"query": "没有", "intent": None, "engines": ["bing"]},
            "metadata": {"result_count": 0, "errors": ["bing: down"]},
        }
    )
    assert payload["ok"] is False
    assert payload["results"] == []
    assert "不要编造" in payload["hint"]
    assert payload["errors"] == ["bing: down"]


def test_run_web_ops_auto_fetches_top1():
    seen: dict = {"pages": []}

    class FakeSearch:
        def search(self, query, intent, max_results):
            seen["args"] = (query, intent, max_results)
            return {
                "aggregated_results": [
                    {
                        "title": "天气",
                        "url": "https://example.com/a",
                        "snippet": "晴",
                        "confidence_score": 1.0,
                        "source_engine": "bing",
                    },
                    {
                        "title": "其它",
                        "url": "https://example.com/b",
                        "snippet": "阴",
                        "confidence_score": 0.95,
                        "source_engine": "bing",
                    },
                ],
                "query_analysis": {"query": query, "intent": intent, "engines": ["bing"]},
                "metadata": {"result_count": 2, "errors": []},
            }

    def page(url: str) -> dict:
        seen["pages"].append(url)
        return {"ok": True, "url": url, "title": "原文", "content": "正文晴 18度"}

    blob = run_web_ops(
        [{"type": "web_search", "q": "上海天气", "intent": "general", "max_results": 40}],
        max_results=4,
        searcher=FakeSearch(),
        page_fetcher=page,
    )
    assert seen["args"] == ("上海天气", "general", 4)
    assert seen["pages"] == ["https://example.com/a"]
    lines = [ln for ln in blob.splitlines() if ln.startswith("{")]
    assert len(lines) == 2
    search = json.loads(lines[0])
    fetched = json.loads(lines[1])
    assert search["results"][0]["content"] == "晴"
    assert fetched["tool"] == "web_fetch" and fetched["content"] == "正文晴 18度"


def test_run_web_ops_explicit_fetch_overrides_top1():
    seen: dict = {"pages": []}

    class FakeSearch:
        def search(self, query, intent, max_results):
            return {
                "aggregated_results": [
                    {
                        "title": "天气",
                        "url": "https://example.com/a",
                        "snippet": "晴",
                        "confidence_score": 1.0,
                        "source_engine": "bing",
                    }
                ],
                "query_analysis": {"query": query, "intent": intent, "engines": ["bing"]},
                "metadata": {"result_count": 1, "errors": []},
            }

    def page(url: str) -> dict:
        seen["pages"].append(url)
        return {"ok": True, "url": url, "title": "B", "content": "第二条正文"}

    blob = run_web_ops(
        [
            {"type": "web_search", "q": "上海天气"},
            {"type": "web_fetch", "url": "https://example.com/b"},
        ],
        searcher=FakeSearch(),
        page_fetcher=page,
    )
    assert seen["pages"] == ["https://example.com/b"]
    lines = [ln for ln in blob.splitlines() if ln.startswith("{")]
    assert len(lines) == 2
    assert json.loads(lines[1])["url"] == "https://example.com/b"


def test_run_web_ops_no_auto_fetch_when_search_empty():
    seen = {"pages": 0}

    class FakeSearch:
        def search(self, query, intent, max_results):
            return {
                "aggregated_results": [],
                "query_analysis": {"query": query, "intent": intent, "engines": ["bing"]},
                "metadata": {"result_count": 0, "errors": ["bing: empty"]},
            }

    def page(url: str) -> dict:
        seen["pages"] += 1
        return {"ok": True, "url": url, "title": "x", "content": "y"}

    blob = run_web_ops(
        [{"type": "web_search", "q": "没有"}],
        searcher=FakeSearch(),
        page_fetcher=page,
    )
    assert seen["pages"] == 0
    lines = [ln for ln in blob.splitlines() if ln.startswith("{")]
    assert len(lines) == 1
    assert json.loads(lines[0])["ok"] is False


def test_fetch_rejects_private_targets():
    assert is_public_http_url("http://127.0.0.1/secret") is False
    assert is_public_http_url("http://10.1.2.3/") is False
    assert is_public_http_url("http://localhost/x") is False
    assert is_public_http_url("file:///etc/passwd") is False
    assert is_public_http_url("http://169.254.169.254/latest") is False
    page = fetch_page("http://127.0.0.1/")
    assert page["ok"] is False


def test_fetch_extracts_visible_text(monkeypatch):
    monkeypatch.setattr(
        "src.chat.web_search.fetch.is_public_http_url",
        lambda url: str(url).startswith("https://example.com"),
    )
    html = """
    <html><head><title>天气页</title><style>.x{}</style></head>
    <body><script>alert(1)</script><article><p>今天  晴</p></article></body></html>
    """
    page = fetch_page("https://example.com/a", http_get=lambda url: html, max_chars=100)
    assert page["ok"] is True
    assert page["title"] == "天气页"
    assert page["content"] == "今天 晴"
    assert "alert" not in page["content"]


def test_parse_web_bubbles_ignore_text_budget():
    raw = """{"engagement":"hold","replies":[
      {"type":"text","text":"我去看看"},
      {"type":"web_search","q":"上海天气","intent":"general","max_results":3},
      {"type":"web_fetch","url":"https://example.com/a"}
    ]}"""
    bubbles, eng = parse_persona_json(raw, max_replies=1)
    assert eng == "hold"
    assert [b["type"] for b in bubbles] == ["text", "web_search", "web_fetch"]
    assert bubbles[1]["q"] == "上海天气"
    assert bubbles[1]["intent"] == "general"
    assert bubbles[2]["url"] == "https://example.com/a"
