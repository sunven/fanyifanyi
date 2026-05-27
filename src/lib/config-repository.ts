import type { AIConfig, AIConfigs, TranslationProvider } from './config'
import { secureStorageGet, secureStorageRemove, secureStorageSet } from './secure-storage'

const LEGACY_CONFIG_KEY = 'ai_configs'
const CONFIG_METADATA_KEY = 'ai_config_metadata_v1'
const MODEL_SECRET_PREFIX = 'ai-config:model:'
const DEFAULT_TRANSLATION_PROVIDER: TranslationProvider = 'ai'

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
  translationProvider?: TranslationProvider
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
  translationProvider: DEFAULT_TRANSLATION_PROVIDER,
}

function modelApiKeyStorageKey(modelId: string): string {
  return `${MODEL_SECRET_PREFIX}${modelId}:apiKey`
}

function cloneConfig(config: AIConfigs): AIConfigs {
  return {
    activeModelId: config.activeModelId,
    models: config.models.map(model => ({ ...model })),
    translationProvider: config.translationProvider,
  }
}

function sanitizeTranslationProvider(value: unknown): TranslationProvider {
  if (value === 'google' || value === 'microsoft') {
    return value
  }
  return DEFAULT_TRANSLATION_PROVIDER
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

  return {
    models,
    activeModelId,
    translationProvider: sanitizeTranslationProvider(candidate.translationProvider),
  }
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
    translationProvider: configs.translationProvider,
    models: configs.models.map(({ apiKey: _apiKey, ...model }) => ({
      ...model,
      hasApiKey: Boolean(_apiKey),
    })),
  }
  localStorage.setItem(CONFIG_METADATA_KEY, JSON.stringify(metadata))
}

async function writeSecrets(configs: AIConfigs): Promise<void> {
  await Promise.all(configs.models.map(async (model) => {
    const key = modelApiKeyStorageKey(model.id)
    if (model.apiKey) {
      await secureStorageSet(key, model.apiKey)
      return
    }
    await secureStorageRemove(key)
  }))
}

async function removeSecretsForRemovedModels(
  previousMetadata: StoredConfigMetadata | null,
  nextConfigs: AIConfigs,
): Promise<void> {
  if (!previousMetadata) {
    return
  }

  const nextModelIds = new Set(nextConfigs.models.map(model => model.id))
  await Promise.all(previousMetadata.models
    .filter(model => !nextModelIds.has(model.id))
    .map(model => secureStorageRemove(modelApiKeyStorageKey(model.id))))
}

async function hydrateConfig(metadata: StoredConfigMetadata): Promise<AIConfigs> {
  const models = await Promise.all(metadata.models.map(async model => ({
    id: model.id,
    name: model.name,
    baseURL: model.baseURL,
    model: model.model,
    apiKey: model.hasApiKey
      ? (await secureStorageGet(modelApiKeyStorageKey(model.id))) ?? ''
      : '',
  })))

  return sanitizeConfig({
    models,
    activeModelId: metadata.activeModelId,
    translationProvider: metadata.translationProvider,
  }) ?? cloneConfig(DEFAULT_CONFIG)
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

  const previousMetadata = readStoredMetadata()
  writeMetadata(sanitized)
  await Promise.all([
    writeSecrets(sanitized),
    removeSecretsForRemovedModels(previousMetadata, sanitized),
  ])
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
  await secureStorageRemove(modelApiKeyStorageKey(id))
}

export async function setActiveModelAsync(id: string): Promise<void> {
  const configs = await getAllAIConfigsAsync()
  if (configs.models.some(model => model.id === id)) {
    configs.activeModelId = id
    await saveAllAIConfigsAsync(configs)
  }
}

export async function setTranslationProviderAsync(provider: TranslationProvider): Promise<void> {
  const configs = await getAllAIConfigsAsync()
  configs.translationProvider = provider
  await saveAllAIConfigsAsync(configs)
}

export async function resetAIConfigAsync(): Promise<AIConfigs> {
  const current = await getAllAIConfigsAsync()
  await Promise.all(current.models.map(model => secureStorageRemove(modelApiKeyStorageKey(model.id))))
  try {
    localStorage.removeItem(CONFIG_METADATA_KEY)
    localStorage.removeItem(LEGACY_CONFIG_KEY)
  }
  catch (error) {
    console.error('重置配置失败:', error)
  }
  return cloneConfig(DEFAULT_CONFIG)
}
