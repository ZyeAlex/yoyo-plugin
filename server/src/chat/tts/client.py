from __future__ import annotations

import base64
import logging
import uuid
from typing import Any

import httpx

from src.core.settings import Settings

_logger = logging.getLogger("yoyo.chat.tts")

_SEED_AUDIO_URL = "https://openspeech.bytedance.com/api/v3/tts/create"
_QWEN_TTS_URL = (
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
)
_DEFAULT_MAX_CHARS = 80

# OpenAI speech：核心字段最终覆盖 extra
_OPENAI_CORE = frozenset(
    {"model", "input", "voice", "response_format", "speed", "style"}
)
_SEED_CFG = frozenset({"format", "sample_rate", "speech_rate", "loudness_rate", "pitch_rate"})

TTS_PROVIDER_PRESETS: dict[str, dict[str, str]] = {
    "doubao-seed": {
        "model": "seed-audio-1.0",
        "label": "豆包 Seed-Audio",
    },
    "qwen": {
        "model": "qwen3-tts-flash",
        "label": "通义千问 TTS",
    },
    "openai": {
        "model": "tts-1",
        "label": "OpenAI 兼容",
    },
}


def _clamp_speed(raw: Any, default: float = 1.0) -> float:
    try:
        v = float(raw if raw is not None else default)
    except (TypeError, ValueError):
        v = default
    return max(0.5, min(2.0, v))


def truncate_tts_text(text: str, *, max_chars: int = _DEFAULT_MAX_CHARS) -> str:
    t = (text or "").strip()
    n = max(1, int(max_chars or _DEFAULT_MAX_CHARS))
    return t[:n]


def _extra_dict(settings: Settings) -> dict[str, Any]:
    raw = getattr(settings, "chat_tts_extra", None)
    if isinstance(raw, dict):
        return {str(k): v for k, v in raw.items() if str(k)}
    if isinstance(raw, str) and raw.strip():
        import json

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            _logger.warning("chatTtsExtra is not valid JSON, ignored")
            return {}
        if isinstance(data, dict):
            return {str(k): v for k, v in data.items() if str(k)}
    return {}


def tts_provider(settings: Settings) -> str:
    raw = str(getattr(settings, "chat_tts_provider", "") or "").strip().lower()
    if raw in {"doubao", "seed-audio", "doubao-seed"}:
        return "doubao-seed"
    if raw in {"qwen", "dashscope", "qwen-tts"}:
        return "qwen"
    if raw in {"openai", "openai-compat", "compatible"}:
        return "openai"
    # 兼容旧 auto：按模型猜测
    model = (settings.chat_tts_model or "").strip().lower()
    if model.startswith("seed-audio"):
        return "doubao-seed"
    if model.startswith("qwen") and "tts" in model:
        return "qwen"
    return "openai"


def resolve_seed_audio_url(_base_url: str = "") -> str:
    return _SEED_AUDIO_URL


def resolve_openai_speech_url(base_url: str) -> str:
    b = (base_url or "").strip().rstrip("/")
    if not b:
        raise ValueError("OpenAI 兼容预设需要填写地址（如 https://api.openai.com/v1）")
    low = b.lower()
    if low.endswith("/audio/speech"):
        return b
    return f"{b}/audio/speech"


def speed_to_speech_rate(speed: float) -> int:
    return int(max(-50, min(100, round((_clamp_speed(speed) - 1.0) * 100))))


def _speed_from(settings: Settings, speed: float | None, extra: dict[str, Any]) -> float:
    if speed is not None:
        return _clamp_speed(speed)
    if "speed" in extra:
        return _clamp_speed(extra.get("speed"))
    if "speech_rate" in extra:
        # 豆包 -50..100 → 约 0.5..2.0
        try:
            sr = float(extra["speech_rate"])
            return _clamp_speed(1.0 + sr / 100.0)
        except (TypeError, ValueError):
            pass
    return 1.0


def _voice_from(extra: dict[str, Any], *, default: str = "") -> str:
    v = extra.get("voice")
    if v is None:
        v = extra.get("speaker")
    return str(v or default).strip()


def build_speech_body(
    *,
    text: str,
    settings: Settings,
    speed: float | None = None,
    style: str | None = None,
) -> dict[str, Any]:
    """OpenAI-compatible speech body；voice/speed/format 来自 extra 或默认。"""
    content = truncate_tts_text(text)
    if not content:
        raise ValueError("empty tts text")
    extra = _extra_dict(settings)
    model = (settings.chat_tts_model or "").strip()
    voice = _voice_from(extra, default="alloy") or "alloy"
    fmt = str(extra.get("response_format") or extra.get("format") or "wav").strip() or "wav"
    core: dict[str, Any] = {
        "model": model,
        "input": content,
        "voice": voice,
        "response_format": fmt,
        "speed": _speed_from(settings, speed, extra),
    }
    style_s = str(style or extra.get("style") or "").strip()
    if style_s:
        core["style"] = style_s

    body: dict[str, Any] = {}
    for k, v in extra.items():
        if k in _OPENAI_CORE:
            continue
        body[k] = v
    body.update(core)
    return body


def build_seed_audio_body(
    *,
    text: str,
    settings: Settings,
    speed: float | None = None,
    style: str | None = None,
) -> dict[str, Any]:
    content = truncate_tts_text(text)
    if not content:
        raise ValueError("empty tts text")
    extra = _extra_dict(settings)
    model = (settings.chat_tts_model or "").strip() or "seed-audio-1.0"
    voice = _voice_from(extra)
    fmt = str(extra.get("format") or "wav").strip().lower() or "wav"
    spd = _speed_from(settings, speed, extra)
    style_s = str(style or extra.get("style") or "").strip()

    references: list[dict[str, Any]] = []
    if voice:
        references.append({"speaker": voice})
        text_prompt = f"以{style_s}的语气朗读：{content}" if style_s else content
    else:
        if style_s:
            text_prompt = f"用自然清晰的中文声线，以{style_s}的语气朗读：{content}"
        else:
            text_prompt = f"用自然清晰的中文声线朗读：{content}"

    audio_config: dict[str, Any] = {
        "format": fmt if fmt in {"wav", "mp3", "pcm", "ogg_opus"} else "wav",
        "speech_rate": speed_to_speech_rate(spd),
    }
    body: dict[str, Any] = {
        "model": model,
        "text_prompt": text_prompt,
        "audio_config": audio_config,
    }
    if references:
        body["references"] = references

    for k, v in extra.items():
        if k in {"model", "text_prompt", "references", "voice", "speaker", "speed", "style"}:
            continue
        if k == "audio_config" and isinstance(v, dict):
            audio_config.update({str(kk): vv for kk, vv in v.items()})
            continue
        if k in _SEED_CFG:
            audio_config[k] = v
            continue
        if k not in body:
            body[k] = v
    return body


def build_qwen_tts_body(
    *,
    text: str,
    settings: Settings,
    speed: float | None = None,
    style: str | None = None,
) -> dict[str, Any]:
    """通义千问 TTS（百炼 multimodal-generation）。"""
    del speed  # 千问非实时 TTS 无 OpenAI speed；可放 extra
    content = truncate_tts_text(text, max_chars=600)
    if not content:
        raise ValueError("empty tts text")
    extra = _extra_dict(settings)
    model = (settings.chat_tts_model or "").strip() or "qwen3-tts-flash"
    voice = _voice_from(extra, default="Cherry") or "Cherry"
    language = str(extra.get("language_type") or extra.get("language") or "Chinese").strip() or "Chinese"
    inp: dict[str, Any] = {
        "text": content,
        "voice": voice,
        "language_type": language,
    }
    if style:
        # 非官方字段，部分网关可能忽略
        inp["style"] = str(style).strip()
    body: dict[str, Any] = {"model": model, "input": inp}
    for k, v in extra.items():
        if k in {"model", "input", "voice", "speaker", "text", "language_type", "language", "style"}:
            continue
        if k == "parameters" and isinstance(v, dict):
            body["parameters"] = v
            continue
        body[k] = v
    return body


def _decode_seed_audio_response(resp: httpx.Response) -> bytes:
    ctype = (resp.headers.get("content-type") or "").lower()
    raw = resp.content or b""
    if "application/json" in ctype or (raw[:1] in (b"{", b"[") and b"audio" in raw[:200]):
        try:
            data = resp.json()
        except Exception as err:
            raise RuntimeError(f"seed-audio invalid json: {err}") from err
        if not isinstance(data, dict):
            raise RuntimeError("seed-audio unexpected json")
        code = data.get("code")
        if code is not None and int(code) != 0:
            msg = str(data.get("message") or data.get("msg") or code)
            raise RuntimeError(f"seed-audio code={code}: {msg[:240]}")
        payload = data.get("data") if isinstance(data.get("data"), dict) else data
        b64 = payload.get("audio") if isinstance(payload, dict) else None
        if isinstance(b64, str) and b64.strip():
            if "," in b64 and b64.strip().lower().startswith("data:"):
                b64 = b64.split(",", 1)[1]
            out = base64.b64decode(b64, validate=False)
            if out:
                return out
        url = payload.get("url") if isinstance(payload, dict) else None
        if isinstance(url, str) and url.startswith("http"):
            raise RuntimeError(f"seed-audio returned url-only; retry needed: {url[:80]}")
        raise RuntimeError(f"seed-audio empty audio: {str(data)[:200]}")
    if not raw:
        raise RuntimeError("seed-audio empty body")
    return raw


async def _synthesize_seed_audio(
    *,
    text: str,
    settings: Settings,
    speed: float | None = None,
    style: str | None = None,
) -> bytes:
    key = (settings.chat_tts_api_key or "").strip()
    model = (settings.chat_tts_model or "").strip()
    if not key or not model:
        raise ValueError("豆包 TTS 未配置：请在「豆包」预设填写 API Key 与模型名称")

    url = resolve_seed_audio_url()
    body = build_seed_audio_body(text=text, settings=settings, speed=speed, style=style)
    headers = {
        "Content-Type": "application/json",
        "X-Api-Key": key,
        "X-Api-Request-Id": str(uuid.uuid4()),
    }
    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(url, headers=headers, json=body)
        if resp.status_code >= 400:
            snippet = (resp.text or "")[:300]
            _logger.warning("seed-audio failed status=%s body=%s", resp.status_code, snippet)
            if resp.status_code == 401 or "45000010" in snippet or "Invalid X-Api-Key" in snippet:
                raise RuntimeError(
                    "豆包语音鉴权失败：请填「豆包语音」控制台的 API Key（X-Api-Key），"
                    "不能用方舟/Ark 的 LLM Key。开通入口：火山引擎 → 豆包语音 → API Key 管理"
                )
            if resp.status_code == 403 or "45000030" in snippet or "not granted" in snippet:
                raise RuntimeError(
                    "豆包语音 Key 有效，但未开通 seed-audio 资源权限（resource not granted）。"
                    "请到火山引擎 → 豆包语音 开通「音频生成 / Seed-Audio」并确认该 Key 绑定了对应项目"
                )
            raise RuntimeError(f"seed-audio http {resp.status_code}: {snippet}")
        ctype = (resp.headers.get("content-type") or "").lower()
        if "application/json" in ctype:
            try:
                data = resp.json()
            except Exception:
                data = None
            if isinstance(data, dict):
                payload = data.get("data") if isinstance(data.get("data"), dict) else data
                b64 = payload.get("audio") if isinstance(payload, dict) else None
                url_only = payload.get("url") if isinstance(payload, dict) else None
                if (not b64) and isinstance(url_only, str) and url_only.startswith("http"):
                    r2 = await client.get(url_only, timeout=60.0)
                    if r2.status_code >= 400 or not r2.content:
                        raise RuntimeError(f"seed-audio url fetch failed: {r2.status_code}")
                    return r2.content
        return _decode_seed_audio_response(resp)


async def _synthesize_qwen(
    *,
    text: str,
    settings: Settings,
    speed: float | None = None,
    style: str | None = None,
) -> bytes:
    key = (settings.chat_tts_api_key or "").strip()
    model = (settings.chat_tts_model or "").strip()
    if not key or not model:
        raise ValueError("千问 TTS 未配置：请在「通义千问」预设填写 API Key 与模型名称")

    body = build_qwen_tts_body(text=text, settings=settings, speed=speed, style=style)
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(_QWEN_TTS_URL, headers=headers, json=body)
        if resp.status_code >= 400:
            snippet = (resp.text or "")[:300]
            _logger.warning("qwen-tts failed status=%s body=%s", resp.status_code, snippet)
            raise RuntimeError(f"qwen-tts http {resp.status_code}: {snippet}")
        try:
            data = resp.json()
        except Exception as err:
            raise RuntimeError(f"qwen-tts invalid json: {err}") from err
        if not isinstance(data, dict):
            raise RuntimeError("qwen-tts unexpected response")
        # 错误形态：code 非空
        err_code = data.get("code")
        if err_code:
            raise RuntimeError(f"qwen-tts {err_code}: {str(data.get('message') or '')[:200]}")
        output = data.get("output") if isinstance(data.get("output"), dict) else {}
        audio = output.get("audio") if isinstance(output, dict) else None
        if not isinstance(audio, dict):
            raise RuntimeError(f"qwen-tts missing audio: {str(data)[:200]}")
        b64 = audio.get("data")
        if isinstance(b64, str) and b64.strip():
            return base64.b64decode(b64, validate=False)
        url = audio.get("url")
        if isinstance(url, str) and url.startswith("http"):
            r2 = await client.get(url, timeout=60.0)
            if r2.status_code >= 400 or not r2.content:
                raise RuntimeError(f"qwen-tts url fetch failed: {r2.status_code}")
            return r2.content
        raise RuntimeError("qwen-tts empty audio")


async def _synthesize_openai_speech(
    *,
    text: str,
    settings: Settings,
    speed: float | None = None,
    style: str | None = None,
) -> bytes:
    base = (settings.chat_tts_base_url or "").rstrip("/")
    key = (settings.chat_tts_api_key or settings.llm_api_key or "").strip()
    model = (settings.chat_tts_model or "").strip()
    if not model:
        raise ValueError("OpenAI 兼容 TTS 未配置：请填写模型名称")
    if not key:
        raise ValueError("OpenAI 兼容 TTS 未配置：请填写 API Key（或配置大模型 Key 作回退）")
    if not base:
        raise ValueError("OpenAI 兼容 TTS 未配置：请填写地址")

    body = build_speech_body(text=text, settings=settings, speed=speed, style=style)
    url = resolve_openai_speech_url(base)
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(url, headers=headers, json=body)
        if resp.status_code >= 400:
            snippet = (resp.text or "")[:300]
            _logger.warning("tts speech failed status=%s body=%s", resp.status_code, snippet)
            raise RuntimeError(f"tts http {resp.status_code}: {snippet}")
        data = resp.content
        if not data:
            raise RuntimeError("tts empty audio")
        return data


async def synthesize_speech(
    *,
    text: str,
    settings: Settings,
    speed: float | None = None,
    style: str | None = None,
) -> bytes:
    provider = tts_provider(settings)
    if provider == "doubao-seed":
        return await _synthesize_seed_audio(text=text, settings=settings, speed=speed, style=style)
    if provider == "qwen":
        return await _synthesize_qwen(text=text, settings=settings, speed=speed, style=style)
    return await _synthesize_openai_speech(text=text, settings=settings, speed=speed, style=style)
