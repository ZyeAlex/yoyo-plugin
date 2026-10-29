from pathlib import Path

import pytest

from src.chat.llm import parse_persona_json
from src.chat.tts import job as tts_job
from src.chat.tts.job import run_tts_job
from src.core.settings import Settings


@pytest.mark.asyncio
async def test_run_tts_job_writes_voice_file(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.tts.paths._SERVER_ROOT", tmp_path)
    monkeypatch.setattr(
        "src.chat.tts.job.synthesize_speech",
        lambda **k: _coro(b"WAVDATA"),
    )
    done = {}

    async def on_done(jid, result):
        done["jid"] = jid
        done["result"] = result

    settings = Settings(
        chat_tts_base_url="http://x/v1",
        chat_tts_api_key="k",
        chat_tts_model="m",
        chat_tts_max_chars=80,
    )
    await run_tts_job(
        job_id="abc",
        text="你好呀",
        settings=settings,
        on_done=on_done,
        speed=1.1,
        style="开心",
    )
    assert done["jid"] == "abc"
    result = done["result"]
    assert result["ok"] is True
    assert result["kind"] == "audio"
    assert result["text"] == "你好呀"
    path = Path(result["path"])
    assert path.is_file()
    assert path.read_bytes() == b"WAVDATA"
    assert "voice" in str(path)


@pytest.mark.asyncio
async def test_run_tts_job_failure(tmp_path, monkeypatch):
    monkeypatch.setattr("src.chat.tts.paths._SERVER_ROOT", tmp_path)

    async def boom(**k):
        raise RuntimeError("nope")

    monkeypatch.setattr("src.chat.tts.job.synthesize_speech", boom)
    done = {}

    async def on_done(jid, result):
        done["result"] = result

    await run_tts_job(job_id="x", text="hi", settings=Settings(chat_tts_model="m"), on_done=on_done)
    assert done["result"]["ok"] is False
    assert done["result"]["kind"] == "audio"


def test_parse_persona_json_tts_bubble():
    raw = '{"engagement":"hold","replies":[{"type":"tts","text":"嗨","speed":1.2,"style":"开心"},{"type":"text","text":"旁白"}]}'
    bubbles, eng = parse_persona_json(raw, max_replies=1)
    assert eng == "hold"
    assert bubbles[0]["type"] == "tts"
    assert bubbles[0]["text"] == "嗨"
    assert bubbles[0]["speed"] == 1.2
    assert bubbles[0]["style"] == "开心"
    assert bubbles[1]["type"] == "text"


async def _coro(value):
    return value
