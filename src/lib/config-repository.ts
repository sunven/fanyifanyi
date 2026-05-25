import type { AIConfig, AIConfigs } from './config'
import { secureStorageGet, secureStorageRemove, secureStorageSet } from './secure-storage'

const LEGACY_CONFIG_KEY = 'ai_configs'
const CONFIG_METADATA_KEY = 'ai_config_metadata_v1'
const MODEL_SECRET_PREFIX = 'ai-config:model:'

interface StoredModelMetadata {
  id: string
  name: string
  baseURL: string
  model: string
  hasApiKey?: boolean
}

interface StoredConfigMetadata {
  version: 1
  models: StoredModelMetadata[]
  activeModelId: string
}

const DEFAULT_MODELS: AIConfig[] = [
  {
    id: 'default-1',
    name: 'DeepSeek V3',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    apiKey: '',
    model: 'deepseek-v3',
  },
]

export const DEFAULT_CONFIG: AIConfigs = {
  models: DEFAULT_MODELS,
  activeModelId: 'default-1',
}

function cloneConfig(config: AIConfigs): AIConfigs {
  return {
    activeModelId: config.activeModelId,
    models: config.models.map(model => ({ ...model })),
  }
}

function sanitizeConfig(value: unknown): AIConfigs | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<AIConfigs>
  if (!Array.isArray(candidate.models) || candidate.models.length === 0) {
    return null
  }

  const models = candidate.models
    .filter((model): model is AIConfig => {
      if (!model || typeof model !== 'object') {
        return false
      }
      const partial = model as Partial<AIConfig>
      return Boolean(
        partial.id
        && partial.name
        && partial.baseURL
        && typeof partial.apiKey === 'string'
        && partial.model,
      )
    })
    .map(model => ({ ...model }))

  if (models.length === 0) {
    return null
  }

  const activeModelId = typeof candidate.activeModelId === 'string'
    && models.some(model => model.id === candidate.activeModelId)
    ? candidate.activeModelId
    : models[0].id

  return { models, activeModelId }
}

function readStoredMetadata(): StoredConfigMetadata | null {
  try {
    const stored = localStorage.getItem(CONFIG_METADATA_KEY)
    if (!stored) {
      return null
    }
    const parsed = JSON.parse(stored) as StoredConfigMetadata
    if (parsed.version !== 1 || !Array.isArray(parsed.models) || parsed.models.length === 0) {
      return null
    }
    return parsed
  }
  catch (error) {
    console.error('读取配置元数据失败:', error)
    return null
  }
}

function readLegacyConfig(): AIConfigs | null {
  try {
    const stored = localStorage.getItem(LEGACY_CONFIG_KEY)
    if (!stored) {
      return null
    }
    return sanitizeConfig(JSON.parse(stored))
  }
  catch (error) {
    console.error('读取旧配置失败:', error)
    return null
  }
}

function writeMetadata(configs: AIConfigs): void {
  const metadata: StoredConfigMetadata = {
    version: 1,
    activeModelId: configs.activeModelId,
    models: configs.models.map(({ apiKey: _apiKey, ...model }) => ({
      ...model,
      hasApiKey: Boolean(_apiKey),
    })),
  }
  localStorage.setItem(CONFIG_METADATA_KEY, JSON.stringify(metadata))
}

async function writeSecrets(configs: AIConfigs): Promise<void> {
  await Promise.all(configs.models.map(async model => {
    const key = `${MODEL_SECRET_PREFIX}${model.id}:apiKey`
    if (model.apiKey) {
      await secureStorageSet(key, model.apiKey)
      return
    }
    await secureStorageRemove(key)
  }))
}

async function hydrateConfig(metadata: StoredConfigMetadata): Promise<AIConfigs> {
  const models = await Promise.all(metadata.models.map(async model => ({
    id: model.id,
    name: model.name,
    baseURL: model.baseURL,
    model: model.model,
    apiKey: model.hasApiKey
      ? (await secureStorageGet(`${MODEL_SECRET_PREFIX}${model.id}:apiKey`)) ?? ''
      : '',
  })))

  return sanitizeConfig({ models, activeModelId: metadata.activeModelId }) ?? cloneConfig(DEFAULT_CONFIG)
}

async function migrateLegacyConfig(): Promise<AIConfigs | null> {
  const legacy = readLegacyConfig()
  if (!legacy) {
    return null
  }

  await saveAllAIConfigsAsync(legacy)
  try {
    localStorage.removeItem(LEGACY_CONFIG_KEY)
  }
  catch (error) {
    console.error('清理旧配置失败:', error)
  }
  return cloneConfig(legacy)
}

export async function getAllAIConfigsAsync(): Promise<AIConfigs> {
  const metadata = readStoredMetadata()
  if (metadata) {
    return hydrateConfig(metadata)
  }

  const migrated = await migrateLegacyConfig()
  return migrated ?? cloneConfig(DEFAULT_CONFIG)
}

export async function getAIConfigAsync(): Promise<AIConfig> {
  const configs = await getAllAIConfigsAsync()
  return configs.models.find(model => model.id === configs.activeModelId) ?? configs.models[0]
}

export async function saveAllAIConfigsAsync(configs: AIConfigs): Promise<void> {
  const sanitized = sanitizeConfig(configs)
  if (!sanitized) {
    throw new Error('AI 配置无效')
  }

  writeMetadata(sanitized)
  await writeSecrets(sanitized)
}

export async function addAIConfigAsync(config: Omit<AIConfig, 'id'>): Promise<AIConfig> {
  const configs = await getAllAIConfigsAsync()
  const newConfig: AIConfig = {
    ...config,
    id: `model-${Date.now()}`,
  }
  configs.models.push(newConfig)
  await saveAllAIConfigsAsync(configs)
  return newConfig
}

export async function updateAIConfigAsync(
  id: string,
  config: Partial<Omit<AIConfig, 'id'>>,
): Promise<void> {
  const configs = await getAllAIConfigsAsync()
  const index = configs.models.findIndex(model => model.id === id)
  if (index !== -1) {
    configs.models[index] = { ...configs.models[index], ...config }
    await saveAllAIConfigsAsync(configs)
  }
}

export async function deleteAIConfigAsync(id: string): Promise<void> {
  const configs = await getAllAIConfigsAsync()
  if (configs.models.length <= 1) {
    throw new Error('至少需要保留一个模型配置')
  }

  configs.models = configs.models.filter(model => model.id !== id)
  if (configs.activeModelId === id) {
    configs.activeModelId = configs.models[0].id
  }
  await saveAllAIConfigsAsync(configs)
  await secureStorageRemove(`${MODEL_SECRET_PREFIX}${id}:apiKey`)
}

export async function setActiveModelAsync(id: string): Promise<void> {
  const configs = await getAllAIConfigsAsync()
  if (configs.models.some(model => model.id === id)) {
    configs.activeModelId = id
    await saveAllAIConfigsAsync(configs)
  }
}

export async function resetAIConfigAsync(): Promise<AIConfigs> {
  const current = await getAllAIConfigsAsync()
  await Promise.all(current.models.map(model => secureStorageRemove(`${MODEL_SECRET_PREFIX}${model.id}:apiKey`)))
  try {
    localStorage.removeItem(CONFIG_METADATA_KEY)
    localStorage.removeItem(LEGACY_CONFIG_KEY)
  }
  catch (error) {
    console.error('重置配置失败:', error)
  }
  return cloneConfig(DEFAULT_CONFIG)
}
