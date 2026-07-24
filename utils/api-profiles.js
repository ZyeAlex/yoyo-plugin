/** 与 server/src/core/api_providers.py 对齐的多供应商 profile 结构 */

export const PROVIDER_IDS = ['siliconflow', 'volcengine', 'dashscope', 'custom']

/** 与 server PRESETS base_url 对齐 */
export const PROVIDER_BASE_URLS = {
  siliconflow: 'https://api.siliconflow.cn/v1',
  volcengine: 'https://ark.cn-beijing.volces.com/api/v3',
  dashscope: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  custom: '',
}

/** Embedding 全局默认（仅模型与维度；基址/Key 留空则沿用当前 LLM 供应商） */
export const EMBEDDING_DEFAULTS = {
  model: 'BAAI/bge-m3',
  dim: 1024,
}

/** LLM 旧版扁平镜像：保存时由 flattenActiveProfile 派生，不接受面板 patch 覆盖 */
export const LEGACY_LLM_MIRROR_KEYS = new Set([
  'agentLlmApiKey',
  'agentLlmBaseUrl',
  'agentLlmModel',
  'agentVisionModel',
])

/** @deprecated 使用 LEGACY_LLM_MIRROR_KEYS */
export const LEGACY_AGENT_API_MIRROR_KEYS = LEGACY_LLM_MIRROR_KEYS

export const PRESETS = {
  siliconflow: {
    label: '硅基流动',
    llmModel: 'deepseek-ai/DeepSeek-V4-Flash',
    visionModel: 'zai-org/GLM-4.5V',
  },
  volcengine: {
    label: '火山方舟',
    llmModel: 'doubao-pro-32k-241215',
    visionModel: 'doubao-seed-1-8-251228',
  },
  dashscope: {
    label: '阿里百炼',
    llmModel: 'qwen-plus',
    visionModel: 'qwen-vl-max',
  },
  custom: {
    label: '自定义',
    llmModel: '',
    visionModel: '',
  },
}

export const API_PROVIDER_OPTIONS = [
  { label: '硅基流动（推荐）', value: 'siliconflow', portalUrl: 'https://cloud.siliconflow.cn/i/Uejap3DC' },
  { label: '火山方舟', value: 'volcengine', portalUrl: 'https://volcengine.com/L/xQ9aXbZ3xGE/' },
  { label: '阿里百炼', value: 'dashscope', portalUrl: 'https://bailian.console.aliyun.com/cn-beijing#/home' },
  { label: '自定义', value: 'custom' },
]

export function defaultProfile(provider) {
  const preset = PRESETS[provider] || PRESETS.siliconflow
  return {
    apiKey: '',
    baseUrl: PROVIDER_BASE_URLS[provider] || '',
    llmModel: preset.llmModel,
    visionModel: preset.visionModel,
  }
}

export function defaultProfiles() {
  return Object.fromEntries(PROVIDER_IDS.map((id) => [id, defaultProfile(id)]))
}

function legacyFlatProfile(config, provider) {
  const profile = defaultProfile(provider)
  const apiKey = config.agentLlmApiKey || ''
  if (apiKey) profile.apiKey = String(apiKey)
  const baseUrl = config.agentLlmBaseUrl || ''
  if (baseUrl) profile.baseUrl = String(baseUrl)
  if (config.agentLlmModel) profile.llmModel = String(config.agentLlmModel)
  if (config.agentVisionModel) profile.visionModel = String(config.agentVisionModel)
  return profile
}

function normalizeProfile(raw, provider) {
  const base = defaultProfile(provider)
  if (!raw || typeof raw !== 'object') return base
  return {
    apiKey: raw.apiKey != null ? String(raw.apiKey) : base.apiKey,
    baseUrl: raw.baseUrl != null ? String(raw.baseUrl) : base.baseUrl,
    llmModel: raw.llmModel ? String(raw.llmModel) : base.llmModel,
    visionModel: raw.visionModel ? String(raw.visionModel) : base.visionModel,
  }
}

/** 补全 agentApiProfiles，并从旧版扁平字段迁移到当前激活供应商 */
export function ensureApiProfiles(config) {
  const active = PROVIDER_IDS.includes(config.agentApiProvider)
    ? config.agentApiProvider
    : 'siliconflow'
  const profiles = defaultProfiles()
  const raw = config.agentApiProfiles
  if (raw && typeof raw === 'object') {
    for (const id of PROVIDER_IDS) {
      if (raw[id]) profiles[id] = normalizeProfile(raw[id], id)
    }
  }
  for (const id of PROVIDER_IDS) {
    const preset = PRESETS[id] || PRESETS.siliconflow
    if (!profiles[id].visionModel && preset.visionModel) {
      profiles[id].visionModel = preset.visionModel
    }
    if (!profiles[id].baseUrl && PROVIDER_BASE_URLS[id]) {
      profiles[id].baseUrl = PROVIDER_BASE_URLS[id]
    }
  }

  const hasStoredProfiles = raw && typeof raw === 'object' && PROVIDER_IDS.some((id) => {
    const p = raw[id]
    return p && typeof p === 'object' && (p.llmModel || p.apiKey)
  })
  if (!hasStoredProfiles) {
    const legacy = legacyFlatProfile(config, active)
    if (legacy.apiKey) profiles[active].apiKey = legacy.apiKey
    if (legacy.baseUrl) profiles[active].baseUrl = legacy.baseUrl
    if (legacy.llmModel) profiles[active].llmModel = legacy.llmModel
    if (legacy.visionModel) profiles[active].visionModel = legacy.visionModel
  }

  return { ...config, agentApiProvider: active, agentApiProfiles: profiles }
}

function resolveProviderBaseUrl(provider, profile) {
  if (provider === 'custom') return profile.baseUrl || ''
  return PROVIDER_BASE_URLS[provider] || ''
}

/** 独立 Embedding 全局配置；Key 留空则回退到当前 LLM 供应商 Key */
export function ensureEmbeddingConfig(config) {
  const normalized = ensureApiProfiles(config)
  const active = normalized.agentApiProvider
  const profile = normalized.agentApiProfiles[active]

  const out = { ...normalized }
  if (out.agentEmbeddingBaseUrl == null) out.agentEmbeddingBaseUrl = ''
  if (!out.agentEmbeddingModel) {
    const legacyProfile = config.agentApiProfiles?.[active]
    out.agentEmbeddingModel = legacyProfile?.embeddingModel || EMBEDDING_DEFAULTS.model
  }
  if (out.agentEmbeddingDim == null || out.agentEmbeddingDim === '') {
    const legacyProfile = config.agentApiProfiles?.[active]
    out.agentEmbeddingDim = legacyProfile?.embeddingDim || EMBEDDING_DEFAULTS.dim
  }
  if (out.agentEmbeddingApiKey == null) out.agentEmbeddingApiKey = ''

  return out
}

/** 将当前激活供应商 LLM 写回扁平镜像；Embedding 保持全局字段 */
export function flattenActiveProfile(config) {
  const normalized = ensureEmbeddingConfig(config)
  const active = normalized.agentApiProvider
  const profile = normalized.agentApiProfiles[active]
  const baseUrl = resolveProviderBaseUrl(active, profile)
  const apiKey = profile.apiKey || ''
  return {
    ...normalized,
    agentLlmApiKey: apiKey,
    agentLlmBaseUrl: active === 'custom' ? baseUrl : '',
    agentLlmModel: profile.llmModel || '',
    agentVisionModel: profile.visionModel || '',
  }
}

export function mergeProfilePatch(current, patch) {
  const next = ensureApiProfiles({ ...current, ...patch })
  if (patch.agentApiProfiles && typeof patch.agentApiProfiles === 'object') {
    for (const id of PROVIDER_IDS) {
      if (patch.agentApiProfiles[id]) {
        next.agentApiProfiles[id] = normalizeProfile(
          { ...next.agentApiProfiles[id], ...patch.agentApiProfiles[id] },
          id,
        )
      }
    }
  }
  if (patch.agentApiProvider) {
    next.agentApiProvider = patch.agentApiProvider
  }
  return flattenActiveProfile(next)
}
