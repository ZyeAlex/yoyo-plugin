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
    max_replies: int = Field(default=2, alias="CHAT_MAX_REPLIES")
    max_output_tokens: int = Field(default=512, alias="CHAT_MAX_OUTPUT_TOKENS")
    interrupt_enabled: bool = Field(default=True, alias="CHAT_INTERRUPT_ENABLED")
    timeline_limit: int = Field(default=40, alias="CHAT_TIMELINE_LIMIT")
    bot_names: str = Field(default="悠悠,小悠", alias="CHAT_BOT_NAMES")
    # 全局关闭深度思考 / 流式（写死策略；保留字段便于日后开关）
    enable_thinking: bool = Field(default=False, alias="CHAT_ENABLE_THINKING")
    stream: bool = Field(default=False, alias="CHAT_STREAM")
    # 主动插话总开关（热度关闭时仍只认硬触发）
    proactive_enabled: bool = Field(default=True, alias="CHAT_PROACTIVE_ENABLED")
    # 时间看群：attention → log-uniform 间隔；遗留 engaged/observe 秒数仅兼容配置
    chat_heat_enabled: bool = Field(default=True, alias="CHAT_HEAT_ENABLED")
    chat_heat_debounce_sec: float = Field(default=1.5, alias="CHAT_HEAT_DEBOUNCE_SEC")
    chat_heat_engaged_sec: float = Field(default=90.0, alias="CHAT_HEAT_ENGAGED_SEC")
    chat_heat_observe_sec: float = Field(default=90.0, alias="CHAT_HEAT_OBSERVE_SEC")
    chat_glance_idle_sec: tuple[float, float] = Field(default=(1500.0, 3600.0), alias="CHAT_GLANCE_IDLE_SEC")
    chat_glance_chat_sec: tuple[float, float] = Field(default=(20.0, 40.0), alias="CHAT_GLANCE_CHAT_SEC")
    chat_glance_focus_sec: tuple[float, float] = Field(default=(3.0, 8.0), alias="CHAT_GLANCE_FOCUS_SEC")
    chat_speak_min_gap_sec: tuple[float, float] = Field(default=(3.0, 5.0), alias="CHAT_SPEAK_MIN_GAP_SEC")
    chat_at_reaction_sec: tuple[float, float] = Field(default=(2.0, 8.0), alias="CHAT_AT_REACTION_SEC")
    chat_unanswered_give_up_sec: float = Field(default=480.0, alias="CHAT_UNANSWERED_GIVE_UP_SEC")
    chat_attention_decay_per_min: float = Field(default=0.92, alias="CHAT_ATTENTION_DECAY_PER_MIN")
    chat_dwell_hot_sec: tuple[float, float] = Field(default=(60.0, 180.0), alias="CHAT_DWELL_HOT_SEC")
    chat_dwell_chat_sec: tuple[float, float] = Field(default=(30.0, 90.0), alias="CHAT_DWELL_CHAT_SEC")
    chat_dwell_idle_sec: tuple[float, float] = Field(default=(10.0, 30.0), alias="CHAT_DWELL_IDLE_SEC")
    chat_backoff_retry_sec: tuple[float, ...] = Field(
        default=(90.0, 300.0, 900.0, 1800.0, 3600.0), alias="CHAT_BACKOFF_RETRY_SEC"
    )
    chat_backoff_attention_factor: float = Field(default=0.5, alias="CHAT_BACKOFF_ATTENTION_FACTOR")
    tools_enabled: bool = Field(default=True, alias="CHAT_TOOLS_ENABLED")
    draw_mock_delay_sec: float = Field(default=3.0, alias="CHAT_DRAW_MOCK_DELAY_SEC")
    # 图生成（画画）；model 为空则走 mock
    chat_draw_base_url: str = Field(default="", alias="CHAT_DRAW_BASE_URL")
    chat_draw_api_key: str = Field(default="", alias="CHAT_DRAW_API_KEY")
    chat_draw_model: str = Field(default="", alias="CHAT_DRAW_MODEL")
    chat_draw_edit_model: str = Field(default="", alias="CHAT_DRAW_EDIT_MODEL")
    chat_draw_size: str = Field(default="1080x1920", alias="CHAT_DRAW_SIZE")
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
    chat_sticker_library_cap: int = Field(default=120, alias="CHAT_STICKER_LIBRARY_CAP")
    chat_sticker_reply_enabled: bool = Field(default=True, alias="CHAT_STICKER_REPLY_ENABLED")
    chat_sticker_max_per_reply: int = Field(default=1, alias="CHAT_STICKER_MAX_PER_REPLY")
    chat_sticker_shelf_enabled: bool = Field(default=True, alias="CHAT_STICKER_SHELF_ENABLED")
    chat_sticker_shelf_size: int = Field(default=5, alias="CHAT_STICKER_SHELF_SIZE")
    # 非斗图时注入货架的概率（斗图/对方发表情必开）。0=仅斗图；1=每轮都开
    chat_sticker_shelf_chance: float = Field(default=0.45, alias="CHAT_STICKER_SHELF_CHANCE")
    # 游戏图鉴 L0 / lookup（Chat 只读 data/game）
    chat_game_kb_enabled: bool = Field(default=True, alias="CHAT_GAME_KB_ENABLED")
    chat_game_self_hero_id: str = Field(default="101003", alias="CHAT_GAME_SELF_HERO_ID")
    chat_game_l0_max_chars: int = Field(default=2800, alias="CHAT_GAME_L0_MAX_CHARS")
    chat_game_lookup_max: int = Field(default=2, alias="CHAT_GAME_LOOKUP_MAX")
    # 角色外观 look + draw.use_ref
    chat_hero_look_enabled: bool = Field(default=True, alias="CHAT_HERO_LOOK_ENABLED")
    chat_hero_look_max_per_turn: int = Field(default=1, alias="CHAT_HERO_LOOK_MAX_PER_TURN")
    # 联网搜索（DuckDuckGo HTML → Bing，无 API Key）
    chat_web_search_enabled: bool = Field(default=True, alias="CHAT_WEB_SEARCH_ENABLED")
    chat_web_search_max_results: int = Field(default=10, alias="CHAT_WEB_SEARCH_MAX_RESULTS")
    # TTS（OpenAI 兼容 /v1/audio/speech；配齐模型即启用，无单独开关）
    chat_tts_base_url: str = Field(default="", alias="CHAT_TTS_BASE_URL")
    chat_tts_api_key: str = Field(default="", alias="CHAT_TTS_API_KEY")
    chat_tts_model: str = Field(default="", alias="CHAT_TTS_MODEL")
    chat_tts_voice: str = Field(default="default", alias="CHAT_TTS_VOICE")
    chat_tts_speed: float = Field(default=1.0, alias="CHAT_TTS_SPEED")
    chat_tts_format: str = Field(default="wav", alias="CHAT_TTS_FORMAT")
    chat_tts_max_chars: int = Field(default=80, alias="CHAT_TTS_MAX_CHARS")
    chat_tts_extra: dict = Field(default_factory=dict, alias="CHAT_TTS_EXTRA")

    model_config = {"populate_by_name": True, "extra": "ignore"}

    @property
    def bot_name_list(self) -> list[str]:
        return [x.strip() for x in self.bot_names.split(",") if x.strip()]

    @property
    def llm_configured(self) -> bool:
        return bool(self.llm_api_key.strip())

    @property
    def draw_configured(self) -> bool:
        return bool((self.chat_draw_model or "").strip())

    def profile(self, kind: str = "text") -> "Settings":
        """Return a copy with llm_* filled for text | vision | fast | draw."""
        k = (kind or "text").strip().lower()
        if k == "vision":
            return self.model_copy(
                update={
                    "llm_base_url": (self.chat_vision_base_url or "").strip() or self.llm_base_url,
                    "llm_api_key": (self.chat_vision_api_key or "").strip() or self.llm_api_key,
                    "llm_model": (self.chat_vision_model or "").strip() or self.llm_model,
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
        if k == "draw":
            return self.model_copy(
                update={
                    "llm_base_url": (self.chat_draw_base_url or "").strip() or self.llm_base_url,
                    "llm_api_key": (self.chat_draw_api_key or "").strip() or self.llm_api_key,
                    "llm_model": (self.chat_draw_model or "").strip() or self.llm_model,
                }
            )
        if k == "tts":
            return self.model_copy(
                update={
                    "llm_base_url": (self.chat_tts_base_url or "").strip() or self.llm_base_url,
                    "llm_api_key": (self.chat_tts_api_key or "").strip() or self.llm_api_key,
                    "llm_model": (self.chat_tts_model or "").strip() or self.llm_model,
                }
            )
        return self


def _parse_float_list(raw) -> tuple[float, ...] | None:
    parts: list[str]
    if isinstance(raw, str):
        parts = [p.strip() for p in raw.replace("，", ",").split(",") if p.strip()]
    elif isinstance(raw, (list, tuple)):
        parts = [str(x).strip() for x in raw if str(x).strip()]
    else:
        return None
    if not parts:
        return None
    try:
        nums = tuple(float(p) for p in parts)
    except ValueError:
        return None
    positive = tuple(n for n in nums if n > 0)
    return positive or None


def _merge_plugin_yaml(settings: Settings) -> Settings:
    cfg = _load_yaml_config()
    updates: dict = {}
    key = cfg.get("chatLlmApiKey") or ""
    if key and not settings.llm_api_key:
        updates["llm_api_key"] = str(key)
    base = cfg.get("chatLlmBaseUrl") or ""
    if base:
        updates["llm_base_url"] = str(base)
    model = cfg.get("chatLlmModel") or ""
    if model:
        updates["llm_model"] = str(model)
    if "chatMaxReplies" in cfg:
        updates["max_replies"] = int(cfg["chatMaxReplies"])
    if "chatInterruptEnabled" in cfg:
        updates["interrupt_enabled"] = bool(cfg["chatInterruptEnabled"])
    if "chatProactiveEnabled" in cfg:
        updates["proactive_enabled"] = bool(cfg["chatProactiveEnabled"])
    if "chatToolsEnabled" in cfg:
        updates["tools_enabled"] = bool(cfg["chatToolsEnabled"])
    if "chatDrawMockDelaySec" in cfg:
        updates["draw_mock_delay_sec"] = float(cfg["chatDrawMockDelaySec"])
    wakes = cfg.get("chatWakeWords")
    if isinstance(wakes, list) and wakes:
        updates["bot_names"] = ",".join(str(x) for x in wakes)
    if "chatHeatEngagedSec" in cfg:
        updates["chat_heat_engaged_sec"] = float(cfg["chatHeatEngagedSec"])
    if "chatHeatObserveSec" in cfg:
        updates["chat_heat_observe_sec"] = float(cfg["chatHeatObserveSec"])
    if "chatHeatDebounceSec" in cfg:
        updates["chat_heat_debounce_sec"] = float(cfg["chatHeatDebounceSec"])
    if "chatUnansweredGiveUpSec" in cfg:
        updates["chat_unanswered_give_up_sec"] = float(cfg["chatUnansweredGiveUpSec"])
    if "chatAttentionDecayPerMin" in cfg:
        updates["chat_attention_decay_per_min"] = float(cfg["chatAttentionDecayPerMin"])
    for yk, sk in (
        ("chatGlanceIdleSec", "chat_glance_idle_sec"),
        ("chatGlanceChatSec", "chat_glance_chat_sec"),
        ("chatGlanceFocusSec", "chat_glance_focus_sec"),
        ("chatSpeakMinGapSec", "chat_speak_min_gap_sec"),
        ("chatAtReactionSec", "chat_at_reaction_sec"),
        ("chatDwellHotSec", "chat_dwell_hot_sec"),
        ("chatDwellChatSec", "chat_dwell_chat_sec"),
        ("chatDwellIdleSec", "chat_dwell_idle_sec"),
    ):
        raw = cfg.get(yk)
        if isinstance(raw, (list, tuple)) and len(raw) >= 2:
            updates[sk] = (float(raw[0]), float(raw[1]))
    raw_bo = cfg.get("chatBackoffRetrySec")
    parsed_bo = _parse_float_list(raw_bo)
    if parsed_bo:
        updates["chat_backoff_retry_sec"] = parsed_bo
    if "chatBackoffAttentionFactor" in cfg:
        updates["chat_backoff_attention_factor"] = float(cfg["chatBackoffAttentionFactor"])
    if "chatStickerShelfChance" in cfg:
        updates["chat_sticker_shelf_chance"] = float(cfg["chatStickerShelfChance"])
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
        "chatGameKbEnabled": "chat_game_kb_enabled",
        "chatHeroLookEnabled": "chat_hero_look_enabled",
        "chatWebSearchEnabled": "chat_web_search_enabled",
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
        "chatGameL0MaxChars": "chat_game_l0_max_chars",
        "chatGameLookupMax": "chat_game_lookup_max",
        "chatHeroLookMaxPerTurn": "chat_hero_look_max_per_turn",
        "chatWebSearchMaxResults": "chat_web_search_max_results",
        "chatTtsMaxChars": "chat_tts_max_chars",
    }
    for yk, sk in _YAML_INT.items():
        if yk in cfg:
            updates[sk] = int(cfg[yk])
    _YAML_STR = {
        "chatEmbeddingModel": "chat_embedding_model",
        "chatEmbeddingBaseUrl": "chat_embedding_base_url",
        "chatEmbeddingApiKey": "chat_embedding_api_key",
        "chatVisionBaseUrl": "chat_vision_base_url",
        "chatVisionApiKey": "chat_vision_api_key",
        "chatVisionModel": "chat_vision_model",
        "chatDrawBaseUrl": "chat_draw_base_url",
        "chatDrawApiKey": "chat_draw_api_key",
        "chatDrawModel": "chat_draw_model",
        "chatDrawEditModel": "chat_draw_edit_model",
        "chatDrawSize": "chat_draw_size",
        "chatFastBaseUrl": "chat_fast_base_url",
        "chatFastApiKey": "chat_fast_api_key",
        "chatFastModel": "chat_fast_model",
        "chatGameSelfHeroId": "chat_game_self_hero_id",
        "chatTtsBaseUrl": "chat_tts_base_url",
        "chatTtsApiKey": "chat_tts_api_key",
        "chatTtsModel": "chat_tts_model",
        "chatTtsVoice": "chat_tts_voice",
        "chatTtsFormat": "chat_tts_format",
    }
    for yk, sk in _YAML_STR.items():
        if yk in cfg and cfg[yk] is not None:
            updates[sk] = str(cfg[yk])
    if "chatTtsSpeed" in cfg:
        try:
            updates["chat_tts_speed"] = float(cfg["chatTtsSpeed"])
        except (TypeError, ValueError):
            pass
    if "chatTtsExtra" in cfg:
        raw_extra = cfg.get("chatTtsExtra")
        if isinstance(raw_extra, dict):
            updates["chat_tts_extra"] = dict(raw_extra)
        elif isinstance(raw_extra, str) and raw_extra.strip():
            import json

            try:
                parsed = json.loads(raw_extra)
                if isinstance(parsed, dict):
                    updates["chat_tts_extra"] = parsed
            except json.JSONDecodeError:
                pass
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
