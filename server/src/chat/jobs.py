from __future__ import annotations

import asyncio
import logging
import math
import mimetypes
import re
import struct
import uuid
from pathlib import Path
from typing import Any, Awaitable, Callable
from urllib.parse import urlparse

import httpx

from src.core.settings import Settings

_logger = logging.getLogger("yoyo.chat.jobs")

OnDone = Callable[[str, dict[str, Any]], Awaitable[None]]

_SERVER_ROOT = Path(__file__).resolve().parents[2]
_DRAW_DIR = _SERVER_ROOT / "data" / "media" / "draws"
_DEFAULT_SIZE = "1080x1920"
_SIZE_TOKEN_RE = re.compile(r"^(?:\d+(?:\.\d+)?[Kk]|auto)$", re.I)
_SIZE_WH_RE = re.compile(r"^(\d{2,5})\s*[x×*]\s*(\d{2,5})$", re.I)
# 豆包 Seedream 5.0 像素下限（宽×高）
_SEEDREAM_MIN_PIXELS = 921_600
_SEEDREAM_MAX_PIXELS = 4_624_220

# 文生图/改图：用户或模型未写画风时程序补默认
DEFAULT_DRAW_STYLE = "日系二次元"
_STYLE_MARKERS = (
    "日系",
    "二次元",
    "三次元",
    "动漫",
    "anime",
    "manga",
    "写实",
    "照片级",
    "摄影",
    "realistic",
    "photoreal",
    "油画",
    "水彩",
    "水墨",
    "国风",
    "工笔",
    "像素",
    "pixel",
    "赛博",
    "cyberpunk",
    "厚涂",
    "扁平",
    "q版",
    "chibi",
    "3d",
    "粘土",
    "黏土",
    "素描",
    "线稿",
    "美漫",
    "蒸汽朋克",
    "画风",
    "风格",
)


def ensure_default_draw_style(prompt: str) -> str:
    """未指定画风时追加默认「日系二次元」；已有画风标记则原样返回。"""
    p = (prompt or "").strip()
    if not p:
        return DEFAULT_DRAW_STYLE
    low = p.lower()
    for m in _STYLE_MARKERS:
        needle = m.lower()
        if needle in low:
            return p
    return f"{p}，{DEFAULT_DRAW_STYLE}"


def new_job_id() -> str:
    return uuid.uuid4().hex[:12]


def _draw_dir() -> Path:
    _DRAW_DIR.mkdir(parents=True, exist_ok=True)
    return _DRAW_DIR


def _ext_from_url(url: str) -> str:
    path = urlparse(url).path.lower()
    for ext in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        if path.endswith(ext):
            return ext if ext != ".jpeg" else ".jpg"
    return ".png"


def _mime_for(path: Path) -> str:
    guessed, _ = mimetypes.guess_type(str(path))
    return guessed or "image/png"


def _pick_image_url(body: dict[str, Any]) -> str:
    """OpenAI data[].url / b64_json，或 SiliconFlow images[].url。"""
    if not isinstance(body, dict):
        return ""
    data = body.get("data")
    if isinstance(data, list) and data:
        first = data[0] if isinstance(data[0], dict) else {}
        url = str(first.get("url") or "").strip()
        if url:
            return url
        b64 = str(first.get("b64_json") or "").strip()
        if b64:
            return f"data:image/png;base64,{b64}"
    images = body.get("images")
    if isinstance(images, list) and images:
        first = images[0] if isinstance(images[0], dict) else {}
        return str(first.get("url") or "").strip()
    return ""


def _is_edit_only_model(model: str) -> bool:
    m = (model or "").lower()
    return "image-edit" in m or m.endswith("-edit")


def _is_siliconflow(base: str) -> bool:
    return "siliconflow" in (base or "").lower()


def _is_volc_ark(base: str) -> bool:
    b = (base or "").lower()
    return "volces.com" in b or "volcengine" in b or "ark.cn" in b


def _uses_generations_i2i(base: str) -> bool:
    """这些网关图生图走 /images/generations + image，没有标准 /images/edits。"""
    return _is_siliconflow(base) or _is_volc_ark(base)


def parse_size_spec(raw: Any, *, width: Any = None, height: Any = None) -> str | None:
    """解析 size / width+height → 'WxH' 或档位(1K/2K)；无效则 None。"""
    if width is not None and height is not None:
        try:
            w, h = int(width), int(height)
            if 16 <= w <= 8192 and 16 <= h <= 8192:
                return f"{w}x{h}"
        except (TypeError, ValueError):
            pass
    text = str(raw or "").strip()
    if not text:
        return None
    if _SIZE_TOKEN_RE.match(text):
        return text.upper() if text.lower() != "auto" else "auto"
    m = _SIZE_WH_RE.match(text.replace(" ", ""))
    if m:
        w, h = int(m.group(1)), int(m.group(2))
        if 16 <= w <= 8192 and 16 <= h <= 8192:
            return f"{w}x{h}"
    return None


def _read_image_wh(path: Path) -> tuple[int, int] | None:
    """读本地图宽高（PNG/JPEG），不依赖 Pillow。"""
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if len(data) < 24:
        return None
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    if data[:2] == b"\xff\xd8":
        i = 2
        while i + 9 < len(data):
            if data[i] != 0xFF:
                break
            marker = data[i + 1]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                h, w = struct.unpack(">HH", data[i + 5 : i + 9])
                return int(w), int(h)
            if marker == 0xD9 or marker == 0xDA:
                break
            length = struct.unpack(">H", data[i + 2 : i + 4])[0]
            i += 2 + length
    return None


def _scale_wh_to_pixel_range(
    w: int, h: int, *, min_px: int, max_px: int
) -> tuple[int, int]:
    """保持比例缩放到 [min_px, max_px] 总像素区间。"""
    w, h = max(1, int(w)), max(1, int(h))
    px = w * h
    if px < min_px:
        scale = math.sqrt(min_px / px)
        w, h = int(math.ceil(w * scale)), int(math.ceil(h * scale))
    elif px > max_px:
        scale = math.sqrt(max_px / px)
        w, h = max(1, int(w * scale)), max(1, int(h * scale))
    # 偶数对齐，部分网关更稳
    w -= w % 2
    h -= h % 2
    return max(2, w), max(2, h)


def normalize_size_for_provider(size: str, *, base: str) -> str:
    """按网关约束微调 WxH（豆包总像素上下限）；档位原样返回。"""
    spec = (size or "").strip() or _DEFAULT_SIZE
    if _SIZE_TOKEN_RE.match(spec):
        return spec.upper() if spec.lower() != "auto" else "auto"
    m = _SIZE_WH_RE.match(spec.replace(" ", ""))
    if not m:
        return _DEFAULT_SIZE
    w, h = int(m.group(1)), int(m.group(2))
    if _is_volc_ark(base):
        w, h = _scale_wh_to_pixel_range(w, h, min_px=_SEEDREAM_MIN_PIXELS, max_px=_SEEDREAM_MAX_PIXELS)
    return f"{w}x{h}"


def resolve_draw_size(
    settings: Settings,
    *,
    size_override: str | None = None,
    source_path: Path | None = None,
    for_edit: bool = False,
) -> str:
    """文生图：用户指定 > 配置默认(1080x1920)；改图：用户指定 > 原图宽高 > 默认。"""
    if size_override:
        return size_override
    if for_edit and source_path is not None:
        wh = _read_image_wh(source_path)
        if wh:
            return f"{wh[0]}x{wh[1]}"
    return (settings.chat_draw_size or "").strip() or _DEFAULT_SIZE


def _draw_creds(
    settings: Settings, *, for_edit: bool = False
) -> tuple[str, str, str] | dict[str, Any]:
    """Return (base, key, model) or an error dict。size 由调用方单独 resolve。"""
    draw = settings.profile("draw")
    gen_model = (draw.llm_model or "").strip()
    edit_model = (getattr(settings, "chat_draw_edit_model", "") or "").strip()
    if for_edit:
        model = edit_model or gen_model
    else:
        model = gen_model
        if _is_edit_only_model(model):
            return {
                "ok": False,
                "error": f"chatDrawModel={model} 是编辑模型，文生图请换成文生图模型"
                "（如 Qwen/Qwen-Image / doubao-seedream），改图用 chatDrawEditModel",
            }
    if not model:
        return {"ok": False, "error": "未配置 chatDrawModel"}
    key = (draw.llm_api_key or "").strip()
    if not key:
        return {"ok": False, "error": "未配置图生成 API Key"}
    base = (draw.llm_base_url or "").rstrip("/")
    if not base:
        return {"ok": False, "error": "未配置图生成 Base URL"}
    return base, key, model


def _apply_size(payload: dict[str, Any], *, base: str, model: str, size: str) -> None:
    """按网关写入尺寸字段。SiliconFlow Edit 模型不支持 image_size。"""
    if _is_edit_only_model(model):
        return
    normalized = normalize_size_for_provider(size, base=base)
    if _is_siliconflow(base):
        payload["image_size"] = normalized
    else:
        # OpenAI / 豆包方舟等统一 size
        payload["size"] = normalized


async def _download_image(url: str, dest: Path, *, api_key: str = "") -> Path:
    if url.startswith("data:image/") and ";base64," in url:
        import base64

        raw = url.split(";base64,", 1)[1]
        dest.write_bytes(base64.b64decode(raw))
        return dest
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
        res = await client.get(url, headers=headers)
        res.raise_for_status()
        dest.write_bytes(res.content)
    return dest


async def _materialize_source(source: str, *, api_key: str) -> Path | None:
    """path 或 http(s) URL → 本地文件。"""
    raw = (source or "").strip()
    if not raw:
        return None
    p = Path(raw)
    if p.is_file():
        return p
    if raw.startswith(("http://", "https://", "data:image/")):
        dest = _draw_dir() / f"src_{new_job_id()}{_ext_from_url(raw)}"
        try:
            return await _download_image(raw, dest, api_key=api_key)
        except Exception as err:
            _logger.warning("materialize source failed: %s", err)
            return None
    return None


async def _persist_result(
    *,
    body: dict[str, Any],
    prompt: str,
    api_key: str,
    mode: str,
) -> dict[str, Any]:
    image_url = _pick_image_url(body)
    if not image_url:
        return {"ok": False, "error": "网关未返回图片 URL/b64"}
    job = new_job_id()
    dest = _draw_dir() / f"{job}{_ext_from_url(image_url)}"
    try:
        await _download_image(image_url, dest, api_key=api_key)
    except Exception as err:
        return {"ok": False, "error": f"下载结果图失败: {err}"}
    label = "改图" if mode == "edit" else "画作"
    return {
        "ok": True,
        "kind": "image",
        "mode": mode,
        "caption": f"（{label}）{(prompt or '')[:40]}",
        "path": str(dest.resolve()),
        "url": image_url if not image_url.startswith("data:") else "",
    }


async def generate_image(
    settings: Settings,
    prompt: str,
    *,
    size: str | None = None,
) -> dict[str, Any]:
    """OpenAI 兼容 POST /images/generations（文生图）。"""
    creds = _draw_creds(settings, for_edit=False)
    if isinstance(creds, dict):
        return creds
    base, key, model = creds
    size_spec = resolve_draw_size(settings, size_override=size, for_edit=False)
    url = f"{base}/images/generations"
    payload: dict[str, Any] = {
        "model": model,
        "prompt": (prompt or "").strip()[:2000] or "cute illustration",
        "n": 1,
    }
    if _is_volc_ark(base):
        payload["response_format"] = "url"
        payload["watermark"] = False
    _apply_size(payload, base=base, model=model, size=size_spec)

    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            res = await client.post(
                url,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=payload,
            )
            if res.status_code >= 400:
                return {"ok": False, "error": f"generations HTTP {res.status_code}: {res.text[:240]}"}
            body = res.json()
    except Exception as err:
        return {"ok": False, "error": str(err)}

    return await _persist_result(
        body=body if isinstance(body, dict) else {},
        prompt=prompt,
        api_key=key,
        mode="generate",
    )


async def edit_image(
    settings: Settings,
    prompt: str,
    *,
    source: str,
    size: str | None = None,
) -> dict[str, Any]:
    """OpenAI 兼容图编辑 / 图生图。

    主流网关走 multipart /images/edits；SiliconFlow / 豆包方舟走 generations + image。
    尺寸：用户指定 > 原图宽高 > 配置默认。
    """
    creds = _draw_creds(settings, for_edit=True)
    if isinstance(creds, dict):
        return creds
    base, key, model = creds
    src_path = await _materialize_source(source, api_key=key)
    if src_path is None:
        return {"ok": False, "error": "参考图无法下载或路径无效"}

    size_spec = resolve_draw_size(
        settings,
        size_override=size,
        source_path=src_path,
        for_edit=True,
    )
    prompt_text = (prompt or "").strip()[:2000] or "edit this image"
    edits_url = f"{base}/images/edits"
    mime = _mime_for(src_path)
    edits_err = ""

    # 1) 标准 OpenAI edits（multipart）；方舟/硅基无此端点，跳过
    if not _uses_generations_i2i(base):
        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
                with src_path.open("rb") as fh:
                    files = {"image": (src_path.name, fh, mime)}
                    data = {
                        "model": model,
                        "prompt": prompt_text,
                        "n": "1",
                        "size": normalize_size_for_provider(size_spec, base=base),
                    }
                    res = await client.post(
                        edits_url,
                        headers={"Authorization": f"Bearer {key}"},
                        data=data,
                        files=files,
                    )
                if res.status_code < 400:
                    body = res.json()
                    return await _persist_result(
                        body=body if isinstance(body, dict) else {},
                        prompt=prompt,
                        api_key=key,
                        mode="edit",
                    )
                edits_err = f"edits HTTP {res.status_code}: {res.text[:200]}"
        except Exception as err:
            edits_err = str(err)

    # 2) generations + image（方舟 Seedream / SiliconFlow Edit）
    import base64

    b64 = base64.b64encode(src_path.read_bytes()).decode("ascii")
    image_field = f"data:{mime};base64,{b64}"
    gen_url = f"{base}/images/generations"
    payload: dict[str, Any] = {
        "model": model,
        "prompt": prompt_text,
        "image": image_field,
        "n": 1,
    }
    if _is_volc_ark(base):
        payload["response_format"] = "url"
        payload["watermark"] = False
    _apply_size(payload, base=base, model=model, size=size_spec)
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            res = await client.post(
                gen_url,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=payload,
            )
            if res.status_code >= 400:
                prefix = f"{edits_err} | " if edits_err else ""
                return {
                    "ok": False,
                    "error": f"{prefix}generations+image HTTP {res.status_code}: {res.text[:160]}",
                }
            body = res.json()
    except Exception as err:
        prefix = f"{edits_err} | " if edits_err else ""
        return {"ok": False, "error": f"{prefix}generations+image: {err}"}

    return await _persist_result(
        body=body if isinstance(body, dict) else {},
        prompt=prompt,
        api_key=key,
        mode="edit",
    )


async def run_draw_job(
    *,
    job_id: str,
    prompt: str,
    settings: Settings,
    sources: list[str] | None = None,
    size: str | None = None,
    delay_sec: float = 3.0,
    on_done: OnDone | None = None,
) -> None:
    """有参考图 → 编辑；否则 → 文生图；未配模型 → mock。"""
    try:
        prompt = ensure_default_draw_style(prompt)
        refs = [s for s in (sources or []) if str(s or "").strip()]
        if settings.draw_configured:
            if refs:
                result = await edit_image(settings, prompt, source=refs[0], size=size)
            else:
                result = await generate_image(settings, prompt, size=size)
        else:
            await asyncio.sleep(max(0.5, delay_sec))
            mode = "edit" if refs else "generate"
            label = "改图" if mode == "edit" else "画作"
            result = {
                "ok": True,
                "kind": "image",
                "mode": mode,
                "caption": f"（模拟{label}）{prompt[:40]}",
                "path": None,
            }
        if on_done:
            await on_done(job_id, result)
    except asyncio.CancelledError:
        _logger.info("image job cancelled id=%s", job_id)
        raise
    except Exception as err:
        _logger.exception("image job failed id=%s", job_id)
        if on_done:
            await on_done(job_id, {"ok": False, "error": str(err)})
