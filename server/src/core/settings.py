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
    max_replies: int = Field(default=3, alias="CHAT_MAX_REPLIES")
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
    tools_enabled: bool = Field(default=True, alias="CHAT_TOOLS_ENABLED")
    draw_mock_delay_sec: float = Field(default=3.0, alias="CHAT_DRAW_MOCK_DELAY_SEC")

    model_config = {"populate_by_name": True, "extra": "ignore"}

    @property
    def bot_name_list(self) -> list[str]:
        return [x.strip() for x in self.bot_names.split(",") if x.strip()]

    @property
    def llm_configured(self) -> bool:
        return bool(self.llm_api_key.strip())


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
