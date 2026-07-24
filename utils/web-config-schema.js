/** yoyo-plugin 全量配置字段（/yoyo Web UI） */

import {
  API_PROVIDER_OPTIONS,
  PRESETS,
  PROVIDER_IDS,
  defaultProfiles,
  ensureApiProfiles,
  flattenActiveProfile,
  LEGACY_LLM_MIRROR_KEYS,
  mergeProfilePatch,
} from './api-profiles.js'

export { API_PROVIDER_OPTIONS, PRESETS, PROVIDER_IDS, defaultProfiles, ensureApiProfiles, flattenActiveProfile, mergeProfilePatch }

const AUTH_OPTIONS = [
  { label: '所有人', value: 'all' },
  { label: '管理员', value: 'admin' },
  { label: '群主', value: 'owner' },
  { label: '主人', value: 'master' },
]

export const WEB_SECTIONS = [
  { id: 'basic', label: '基础配置', icon: '⌂', desc: '指令前缀与角色图库' },
  { id: 'fun', label: '娱乐功能', icon: '🎮', desc: '群签到与黑白名单' },
  { id: 'agent', label: 'Agent配置', icon: '🤖', desc: 'YoAgent 运行、模型 API、Embedding 与视觉能力' },
]

export const WEB_FIELDS = [
  // ── 基础配置 ──
  {
    key: 'rulePrefix',
    section: 'basic',
    group: 'prefix',
    groupLabel: '指令前缀',
    label: '插件指令前缀',
    type: 'tags',
    help: '正则前缀，如 ~、#?蓝原',
    span: 2,
  },
  {
    key: 'imgPath',
    section: 'basic',
    group: 'image',
    groupLabel: '角色图库',
    label: '角色图片库路径',
    type: 'tags',
    help: '从 Yunzai 根目录起，如 plugins/yoyo-image',
    span: 2,
  },
  {
    key: 'imgUpAuth',
    section: 'basic',
    group: 'image',
    label: '图片上传权限',
    type: 'select',
    options: AUTH_OPTIONS,
  },
  {
    key: 'imgDelAuth',
    section: 'basic',
    group: 'image',
    label: '图片删除权限',
    type: 'select',
    options: AUTH_OPTIONS,
  },
  {
    key: 'imgMaxSize',
    section: 'basic',
    group: 'image',
    label: '上传大小限制 (MB)',
    type: 'number',
    min: 0,
    max: 25,
  },

  // ── 娱乐功能 ──
  {
    key: 'sign',
    section: 'fun',
    group: 'sign',
    groupLabel: '群签到',
    label: '开启签到',
    type: 'switch',
    layout: 'row',
  },
  {
    key: 'signWithdrawal',
    section: 'fun',
    group: 'sign',
    label: '自动撤回签到图',
    type: 'switch',
    layout: 'row',
  },
  {
    key: 'signInclude',
    section: 'fun',
    group: 'sign',
    label: '白名单群号',
    type: 'tags',
    help: '留空表示不限制；填入群号后仅这些群可签到',
    span: 2,
  },
  {
    key: 'signExclude',
    section: 'fun',
    group: 'sign',
    label: '黑名单群号',
    type: 'tags',
    help: '这些群禁止签到',
    span: 2,
  },

  // ── Agent配置：运行 ──
  {
    key: 'agentWakeWords',
    section: 'agent',
    group: 'run',
    groupLabel: '运行与触发',
    label: '唤醒词',
    type: 'tags',
    span: 1,
  },
  {
    key: 'agentInclude',
    section: 'agent',
    group: 'run',
    label: '启用群号白名单',
    type: 'tags',
    help: '留空则不监听任何群',
    span: 2,
  },
  { key: 'agentBufferSize', section: 'agent', group: 'run', label: '消息缓冲条数', type: 'number', min: 1, max: 100 },
  { key: 'agentRecentContextSize', section: 'agent', group: 'run', label: '跨轮上下文条数', type: 'number', min: 4, max: 100 },
  { key: 'agentMaxSteps', section: 'agent', group: 'run', label: 'Agent 最大步数', type: 'number', min: 1, max: 24 },
  { key: 'agentStepTimeoutSimpleSec', section: 'agent', group: 'run', label: '简单 step 限时（秒）', type: 'number', min: 5, max: 120 },
  { key: 'agentStepTimeoutComplexSec', section: 'agent', group: 'run', label: '复杂 step 限时（秒）', type: 'number', min: 10, max: 300 },

  // ── Agent配置：模型 API ──
  {
    key: 'agentApiProvider',
    section: 'agent',
    group: 'api',
    groupLabel: '模型 API',
    label: '当前默认供应商',
    type: 'select',
    span: 1,
    options: API_PROVIDER_OPTIONS,
    help: '切换后下方表单显示该供应商已保存的配置；各供应商配置互不影响',
  },
  {
    profileKey: 'apiKey',
    section: 'agent',
    group: 'api',
    label: 'API Key',
    type: 'password',
    span: 1,
    help: '仅保存到当前选中的供应商',
  },
  {
    profileKey: 'baseUrl',
    section: 'agent',
    group: 'api',
    label: '自定义 API 基址',
    type: 'text',
    span: 1,
    showWhenProvider: 'custom',
    help: '不含 /chat/completions 或 /embeddings',
  },
  { profileKey: 'llmModel', section: 'agent', group: 'api', label: 'LLM 模型', type: 'text', span: 1 },
  { profileKey: 'visionModel', section: 'agent', group: 'api', label: '视觉模型', type: 'text', span: 1, help: '与上方 API Key 同属当前供应商，用于图片识别' },
  { key: 'agentMaxOutputTokens', section: 'agent', group: 'api', label: '最大输出 Token', type: 'number', span: 1, min: 64, max: 8192 },

  // ── Agent配置：Embedding（基址/Key 留空则沿用当前 LLM 供应商）──
  {
    key: 'agentEmbeddingBaseUrl',
    section: 'agent',
    group: 'embedding',
    groupLabel: 'Embedding / 向量索引',
    label: 'API 基址',
    type: 'text',
    span: 1,
    help: '留空则使用「模型 API」当前供应商的基址',
  },
  {
    key: 'agentEmbeddingApiKey',
    section: 'agent',
    group: 'embedding',
    label: 'API Key',
    type: 'password',
    span: 1,
    help: '留空则使用「模型 API」当前供应商的 Key',
  },
  {
    key: 'agentEmbeddingModel',
    section: 'agent',
    group: 'embedding',
    label: 'Embedding 模型',
    type: 'text',
    span: 1,
    help: '更换后需重建知识索引',
  },
  { key: 'agentEmbeddingDim', section: 'agent', group: 'embedding', label: '向量维度', type: 'number', span: 1, min: 64, max: 8192 },
  { key: 'agentEmbeddingBatchSize', section: 'agent', group: 'embedding', label: '批处理大小', type: 'number', span: 1, min: 1, max: 64 },

  // ── Agent配置：视觉表情 ──
  {
    key: 'agentVisionEnabled',
    section: 'agent',
    group: 'vision',
    groupLabel: '视觉与表情',
    label: '图片识别',
    type: 'switch',
    layout: 'row',
  },
  { key: 'agentVisionMaxImages', section: 'agent', group: 'vision', label: '单次最多分析图片数', type: 'number', min: 1, max: 5 },
  { key: 'agentEmoticonEnabled', section: 'agent', group: 'vision', label: '表情包 Sidecar', type: 'switch', layout: 'row' },
  { key: 'agentEmoticonMaxIndexPerTurn', section: 'agent', group: 'vision', label: '每轮最多索引表情', type: 'number', min: 1, max: 10 },
  { key: 'agentEmoticonSearchLimit', section: 'agent', group: 'vision', label: 'search_emoticons 条数', type: 'number', min: 1, max: 20 },
  { key: 'agentEmoticonRecencyHalfLifeDays', section: 'agent', group: 'vision', label: '检索时效半衰期（天）', type: 'number', min: 1, max: 90 },
  { key: 'agentEmoticonMinCatalog', section: 'agent', group: 'vision', label: '表情库保底条数', type: 'number', min: 500, max: 20000 },
  { key: 'agentEmoticonPruneGraceDays', section: 'agent', group: 'vision', label: '新入库保护期（天）', type: 'number', min: 1, max: 30 },
  { key: 'agentEmoticonPruneZeroUseDays', section: 'agent', group: 'vision', label: '零发送淘汰天数', type: 'number', min: 7, max: 365 },
  { key: 'agentEmoticonPruneLowUseDays', section: 'agent', group: 'vision', label: '低发送淘汰天数', type: 'number', min: 14, max: 365 },
]

export const AGENT_RESTART_KEYS = new Set([
  'agentApiProvider',
  'agentApiProfiles',
  'agentEmbeddingApiKey',
  'agentEmbeddingBaseUrl',
  'agentEmbeddingModel',
  'agentEmbeddingDim',
])

export function fieldVisible(field, config) {
  if (field.showWhenProvider) {
    return config.agentApiProvider === field.showWhenProvider
  }
  if (!field.showWhen) return true
  return Object.entries(field.showWhen).every(([k, v]) => config[k] === v)
}

export function mergeConfigPatch(current, patch) {
  let next = mergeProfilePatch(current, {
    agentApiProvider: patch.agentApiProvider ?? current.agentApiProvider,
    agentApiProfiles: patch.agentApiProfiles ?? current.agentApiProfiles,
  })
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'agentApiProvider' || key === 'agentApiProfiles') continue
    if (LEGACY_LLM_MIRROR_KEYS.has(key)) continue
    if (value === undefined) continue
    next[key] = value
  }
  return flattenActiveProfile(ensureApiProfiles(next))
}
