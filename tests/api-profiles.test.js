import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeConfigPatch } from '../utils/web-config-schema.js'
import { EMBEDDING_DEFAULTS } from '../utils/api-profiles.js'

test('mergeConfigPatch keeps profile apiKey when stale flat agentLlmApiKey is in patch', () => {
  const prev = {
    agentApiProvider: 'siliconflow',
    agentApiProfiles: {
      siliconflow: {
        apiKey: 'sk-siliconflow-correct',
        llmModel: 'deepseek-ai/DeepSeek-V4-Flash',
        visionModel: 'zai-org/GLM-4.5V',
      },
    },
    agentEmbeddingBaseUrl: '',
    agentEmbeddingApiKey: '',
    agentEmbeddingModel: EMBEDDING_DEFAULTS.model,
    agentEmbeddingDim: EMBEDDING_DEFAULTS.dim,
    agentLlmApiKey: 'sk-siliconflow-correct',
  }

  const patch = {
    agentApiProvider: 'siliconflow',
    agentApiProfiles: structuredClone(prev.agentApiProfiles),
    agentLlmApiKey: 'f8760202-562c-4ba7-a049-61a48c5354d7',
    agentLlmModel: 'deepseek-ai/DeepSeek-V4-Flash',
  }

  const next = mergeConfigPatch(prev, patch)

  assert.equal(next.agentApiProfiles.siliconflow.apiKey, 'sk-siliconflow-correct')
  assert.equal(next.agentLlmApiKey, 'sk-siliconflow-correct')
  assert.equal(next.agentEmbeddingBaseUrl, '')
  assert.equal(next.agentEmbeddingApiKey, '')
})

test('mergeConfigPatch keeps dedicated embedding overrides', () => {
  const prev = {
    agentApiProvider: 'volcengine',
    agentApiProfiles: {
      volcengine: {
        apiKey: 've-key-1234567890',
        llmModel: 'doubao-pro-32k-241215',
        visionModel: 'doubao-seed-1-8-251228',
      },
    },
    agentEmbeddingBaseUrl: 'https://api.siliconflow.cn/v1',
    agentEmbeddingApiKey: 'emb-dedicated-key',
    agentEmbeddingModel: 'BAAI/bge-m3',
    agentEmbeddingDim: 1024,
  }

  const next = mergeConfigPatch(prev, {
    agentApiProvider: 'volcengine',
    agentApiProfiles: structuredClone(prev.agentApiProfiles),
    agentEmbeddingApiKey: 'emb-dedicated-key',
    agentEmbeddingBaseUrl: 'https://api.siliconflow.cn/v1',
  })

  assert.equal(next.agentLlmApiKey, 've-key-1234567890')
  assert.equal(next.agentEmbeddingApiKey, 'emb-dedicated-key')
  assert.equal(next.agentEmbeddingBaseUrl, 'https://api.siliconflow.cn/v1')
})

test('mergeConfigPatch keeps empty embedding base and key for llm fallback', () => {
  const next = mergeConfigPatch(
    {
      agentApiProvider: 'siliconflow',
      agentApiProfiles: { siliconflow: { apiKey: 'sk-llm', llmModel: 'm' } },
      agentEmbeddingApiKey: '',
      agentEmbeddingBaseUrl: '',
    },
    {
      agentApiProvider: 'siliconflow',
      agentApiProfiles: { siliconflow: { apiKey: 'sk-llm', llmModel: 'm' } },
      agentEmbeddingApiKey: '',
      agentEmbeddingBaseUrl: '',
    },
  )
  assert.equal(next.agentEmbeddingApiKey, '')
  assert.equal(next.agentEmbeddingBaseUrl, '')
})
