from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import Field
from pydantic_settings import BaseSettings


def _plugin_config_path() -> Path:
    # server/ → yoyo-plugin/config/config.yaml
    return Path(__file__).resolve().parents[3] / "config" / "config.yaml"


def _load_yaml_config() -> dict:
    path = _plugin_config_path()
    if not path.exists():
        return {}
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


class Settings(BaseSettings):
    llm_api_key: str = Field(default="", alias="CHAT_LLM_API_KEY")
    llm_base_url: str = Field(default="https://api.siliconflow.cn/v1", alias="CHAT_LLM_BASE_URL")
    llm_model: str = Field(default="deepseek-ai/DeepSeek-V4-Flash", alias="CHAT_LLM_MODEL")
    max_replies: int = Field(default=1, alias="CHAT_MAX_REPLIES")
    max_output_tokens: int = Field(default=512, alias="CHAT_MAX_OUTPUT_TOKENS")
    interrupt_enabled: bool = Field(default=True, alias="CHAT_INTERRUPT_ENABLED")
    timeline_limit: int = Field(default=40, alias="CHAT_TIMELINE_LIMIT")
    bot_names: str = Field(default="悠悠,小悠", alias="CHAT_BOT_NAMES")
    # 全局关闭深度思考 / 流式（写死策略；保留字段便于日后开关）
    enable_thinking: bool = Field(default=False, alias="CHAT_ENABLE_THINKING")
    stream: bool = Field(default=False, alias="CHAT_STREAM")
    # MVP-2：主动插话 + 工具
    proactive_enabled: bool = Field(default=True, alias="CHAT_PROACTIVE_ENABLED")
    proactive_cooldown_sec: float = Field(default=45.0, alias="CHAT_PROACTIVE_COOLDOWN_SEC")
    proactive_max_per_min: int = Field(default=3, alias="CHAT_PROACTIVE_MAX_PER_MIN")
    # 冷热温度：冷状态按温度攒批，热状态防抖后接话
    chat_heat_enabled: bool = Field(default=True, alias="CHAT_HEAT_ENABLED")
    chat_heat_debounce_sec: float = Field(default=1.5, alias="CHAT_HEAT_DEBOUNCE_SEC")
    chat_heat_warm_sec: float = Field(default=180.0, alias="CHAT_HEAT_WARM_SEC")
    chat_heat_warm_msgs: int = Field(default=8, alias="CHAT_HEAT_WARM_MSGS")
    tools_enabled: bool = Field(default=True, alias="CHAT_TOOLS_ENABLED")
    draw_mock_delay_sec: float = Field(default=3.0, alias="CHAT_DRAW_MOCK_DELAY_SEC")
    # 记忆层
    chat_memory_enabled: bool = Field(default=True, alias="CHAT_MEMORY_ENABLED")
    chat_session_history_turns: int = Field(default=20, alias="CHAT_SESSION_HISTORY_TURNS")
    chat_memory_max_inject_chars: int = Field(default=900, alias="CHAT_MEMORY_MAX_INJECT_CHARS")
    chat_group_memory_char_limit: int = Field(default=2200, alias="CHAT_GROUP_MEMORY_CHAR_LIMIT")
    chat_user_memory_char_limit: int = Field(default=800, alias="CHAT_USER_MEMORY_CHAR_LIMIT")
    chat_daily_log_inject_chars: int = Field(default=600, alias="CHAT_DAILY_LOG_INJECT_CHARS")
    chat_slang_enabled: bool = Field(default=True, alias="CHAT_SLANG_ENABLED")
    chat_slang_max_inject: int = Field(default=8, alias="CHAT_SLANG_MAX_INJECT")
    chat_extract_enabled: bool = Field(default=True, alias="CHAT_EXTRACT_ENABLED")
    chat_embedding_enabled: bool = Field(default=True, alias="CHAT_EMBEDDING_ENABLED")
    chat_embedding_model: str = Field(default="BAAI/bge-m3", alias="CHAT_EMBEDDING_MODEL")
    chat_embedding_base_url: str = Field(default="", alias="CHAT_EMBEDDING_BASE_URL")
    chat_embedding_api_key: str = Field(default="", alias="CHAT_EMBEDDING_API_KEY")
    chat_embedding_dim: int = Field(default=1024, alias="CHAT_EMBEDDING_DIM")
    chat_retrieve_top_k: int = Field(default=4, alias="CHAT_RETRIEVE_TOP_K")
    chat_media_max_bytes: int = Field(default=8_388_608, alias="CHAT_MEDIA_MAX_BYTES")
    chat_vision_enabled: bool = Field(default=True, alias="CHAT_VISION_ENABLED")
    chat_vision_max_images: int = Field(default=2, alias="CHAT_VISION_MAX_IMAGES")
    chat_vision_include_recent_on_refer: bool = Field(
        default=True, alias="CHAT_VISION_INCLUDE_RECENT_ON_REFER"
    )
    # 多模态（视觉 / 表情包打标）；空字段回落到文本模型
    chat_vision_base_url: str = Field(default="", alias="CHAT_VISION_BASE_URL")
    chat_vision_api_key: str = Field(default="", alias="CHAT_VISION_API_KEY")
    chat_vision_model: str = Field(default="", alias="CHAT_VISION_MODEL")
    # 快速响应（温度 judge 等）；空字段回落到文本模型
    chat_fast_base_url: str = Field(default="", alias="CHAT_FAST_BASE_URL")
    chat_fast_api_key: str = Field(default="", alias="CHAT_FAST_API_KEY")
    chat_fast_model: str = Field(default="", alias="CHAT_FAST_MODEL")
    chat_sticker_cache_enabled: bool = Field(default=True, alias="CHAT_STICKER_CACHE_ENABLED")
    chat_sticker_vlm_model: str = Field(default="", alias="CHAT_STICKER_VLM_MODEL")
    chat_sticker_library_cap: int = Field(default=120, alias="CHAT_STICKER_LIBRARY_CAP")
    chat_sticker_reply_enabled: bool = Field(default=True, alias="CHAT_STICKER_REPLY_ENABLED")
    chat_sticker_max_per_reply: int = Field(default=1, alias="CHAT_STICKER_MAX_PER_REPLY")
    chat_sticker_shelf_enabled: bool = Field(default=True, alias="CHAT_STICKER_SHELF_ENABLED")
    chat_sticker_shelf_size: int = Field(default=5, alias="CHAT_STICKER_SHELF_SIZE")

    model_config = {"populate_by_name": True, "extra": "ignore"}

    @property
    def bot_name_list(self) -> list[str]:
        return [x.strip() for x in self.bot_names.split(",") if x.strip()]

    @property
    def llm_configured(self) -> bool:
        return bool(self.llm_api_key.strip())

    def profile(self, kind: str = "text") -> "Settings":
        """Return a copy with llm_* filled for text | vision | fast."""
        k = (kind or "text").strip().lower()
        if k == "vision":
            # 兼容旧 chatStickerVlmModel：仅填模型名时仍可用
            model = (
                (self.chat_vision_model or "").strip()
                or (self.chat_sticker_vlm_model or "").strip()
                or self.llm_model
            )
            return self.model_copy(
                update={
                    "llm_base_url": (self.chat_vision_base_url or "").strip() or self.llm_base_url,
                    "llm_api_key": (self.chat_vision_api_key or "").strip() or self.llm_api_key,
                    "llm_model": model,
                }
            )
        if k == "fast":
            return self.model_copy(
                update={
                    "llm_base_url": (self.chat_fast_base_url or "").strip() or self.llm_base_url,
                    "llm_api_key": (self.chat_fast_api_key or "").strip() or self.llm_api_key,
                    "llm_model": (self.chat_fast_model or "").strip() or self.llm_model,
                }
            )
        return self


def _merge_plugin_yaml(settings: Settings) -> Settings:
    cfg = _load_yaml_config()
    updates: dict = {}
    key = cfg.get("chatLlmApiKey") or cfg.get("agentLlmApiKey") or ""
    if key and not settings.llm_api_key:
        updates["llm_api_key"] = str(key)
    base = cfg.get("chatLlmBaseUrl") or cfg.get("agentLlmBaseUrl") or ""
    if base:
        updates["llm_base_url"] = str(base)
    model = cfg.get("chatLlmModel") or cfg.get("agentLlmModel") or ""
    if model:
        updates["llm_model"] = str(model)
    if "chatMaxReplies" in cfg:
        updates["max_replies"] = int(cfg["chatMaxReplies"])
    if "chatInterruptEnabled" in cfg:
        updates["interrupt_enabled"] = bool(cfg["chatInterruptEnabled"])
    if "chatProactiveEnabled" in cfg:
        updates["proactive_enabled"] = bool(cfg["chatProactiveEnabled"])
    if "chatProactiveCooldownSec" in cfg:
        updates["proactive_cooldown_sec"] = float(cfg["chatProactiveCooldownSec"])
    if "chatProactiveMaxPerMin" in cfg:
        updates["proactive_max_per_min"] = int(cfg["chatProactiveMaxPerMin"])
    if "chatToolsEnabled" in cfg:
        updates["tools_enabled"] = bool(cfg["chatToolsEnabled"])
    if "chatDrawMockDelaySec" in cfg:
        updates["draw_mock_delay_sec"] = float(cfg["chatDrawMockDelaySec"])
    wakes = cfg.get("chatWakeWords") or cfg.get("agentWakeWords")
    if isinstance(wakes, list) and wakes:
        updates["bot_names"] = ",".join(str(x) for x in wakes)
    _YAML_BOOL = {
        "chatHeatEnabled": "chat_heat_enabled",
        "chatMemoryEnabled": "chat_memory_enabled",
        "chatSlangEnabled": "chat_slang_enabled",
        "chatExtractEnabled": "chat_extract_enabled",
        "chatEmbeddingEnabled": "chat_embedding_enabled",
        "chatVisionEnabled": "chat_vision_enabled",
        "chatVisionIncludeRecentOnRefer": "chat_vision_include_recent_on_refer",
        "chatStickerCacheEnabled": "chat_sticker_cache_enabled",
        "chatStickerReplyEnabled": "chat_sticker_reply_enabled",
        "chatStickerShelfEnabled": "chat_sticker_shelf_enabled",
    }
    for yk, sk in _YAML_BOOL.items():
        if yk in cfg:
            updates[sk] = bool(cfg[yk])
    _YAML_INT = {
        "chatSessionHistoryTurns": "chat_session_history_turns",
        "chatMemoryMaxInjectChars": "chat_memory_max_inject_chars",
        "chatGroupMemoryCharLimit": "chat_group_memory_char_limit",
        "chatUserMemoryCharLimit": "chat_user_memory_char_limit",
        "chatDailyLogInjectChars": "chat_daily_log_inject_chars",
        "chatSlangMaxInject": "chat_slang_max_inject",
        "chatEmbeddingDim": "chat_embedding_dim",
        "chatRetrieveTopK": "chat_retrieve_top_k",
        "chatMediaMaxBytes": "chat_media_max_bytes",
        "chatVisionMaxImages": "chat_vision_max_images",
        "chatStickerLibraryCap": "chat_sticker_library_cap",
        "chatStickerMaxPerReply": "chat_sticker_max_per_reply",
        "chatStickerShelfSize": "chat_sticker_shelf_size",
    }
    for yk, sk in _YAML_INT.items():
        if yk in cfg:
            updates[sk] = int(cfg[yk])
    _YAML_STR = {
        "chatEmbeddingModel": "chat_embedding_model",
        "chatEmbeddingBaseUrl": "chat_embedding_base_url",
        "chatEmbeddingApiKey": "chat_embedding_api_key",
        "chatStickerVlmModel": "chat_sticker_vlm_model",
        "chatVisionBaseUrl": "chat_vision_base_url",
        "chatVisionApiKey": "chat_vision_api_key",
        "chatVisionModel": "chat_vision_model",
        "chatFastBaseUrl": "chat_fast_base_url",
        "chatFastApiKey": "chat_fast_api_key",
        "chatFastModel": "chat_fast_model",
    }
    for yk, sk in _YAML_STR.items():
        if yk in cfg and cfg[yk] is not None:
            updates[sk] = str(cfg[yk])
    if updates:
        return settings.model_copy(update=updates)
    return settings


@lru_cache
def get_settings() -> Settings:
    base = Settings()
    # env overrides yaml; yaml fills blanks
    if os.getenv("CHAT_LLM_API_KEY"):
        return base
    return _merge_plugin_yaml(base)


def reload_settings() -> Settings:
    get_settings.cache_clear()
    return get_settings()
