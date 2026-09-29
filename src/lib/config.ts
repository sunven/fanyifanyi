import { secureStorageGet, secureStorageRemove, secureStorageSet } from './secure-storage'

export type TranslationProvider = 'ai' | 'google' | 'microsoft'

export interface AIConfig {
  id: string
  name: string
  baseURL: string
  apiKey: string
  model: string
}

export interface AIConfigs {
  models: AIConfig[]
  activeModelId: string
  translationProvider: TranslationProvider
}

export interface TranslationSettings {
  provider: TranslationProvider
  modelId: string
  baseURL: string
  model: string
}

const LEGACY_CONFIG_KEY = 'ai_configs'
const CONFIG_METADATA_KEY = 'ai_config_metadata_v1'
const MODEL_SECRET_PREFIX = 'ai-config:model:'
const DEFAULT_TRANSLATION_PROVIDER: TranslationProvider = 'google'

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
  if (value === 'ai' || value === 'google' || value === 'microsoft') {
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

function writeStoredMetadata(metadata: StoredConfigMetadata): void {
  localStorage.setItem(CONFIG_METADATA_KEY, JSON.stringify(metadata))
}

async function ensureMetadata(): Promise<StoredConfigMetadata> {
  const existing = readStoredMetadata()
  if (existing) {
    return existing
  }

  await migrateLegacyConfig()
  const migrated = readStoredMetadata()
  if (migrated) {
    return migrated
  }

  const defaults = cloneConfig(DEFAULT_CONFIG)
  const metadata: StoredConfigMetadata = {
    version: 1,
    activeModelId: defaults.activeModelId,
    translationProvider: defaults.translationProvider,
    models: defaults.models.map(({ apiKey, ...model }) => ({
      ...model,
      hasApiKey: Boolean(apiKey),
    })),
  }
  writeStoredMetadata(metadata)
  return metadata
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

function translationSettingsFromMetadata(metadata: StoredConfigMetadata): TranslationSettings {
  const active = metadata.models.find(model => model.id === metadata.activeModelId) ?? metadata.models[0]
  return {
    provider: sanitizeTranslationProvider(metadata.translationProvider),
    modelId: active.id,
    baseURL: active.baseURL,
    model: active.model,
  }
}

async function migrateLegacyConfig(): Promise<AIConfigs | null> {
  const legacy = readLegacyConfig()
  if (!legacy) {
    return null
  }

  await saveAIConfigs(legacy)
  try {
    localStorage.removeItem(LEGACY_CONFIG_KEY)
  }
  catch (error) {
    console.error('清理旧配置失败:', error)
  }
  return cloneConfig(legacy)
}

export async function loadAIConfigs(): Promise<AIConfigs> {
  const metadata = readStoredMetadata()
  if (metadata) {
    return hydrateConfig(metadata)
  }

  const migrated = await migrateLegacyConfig()
  return migrated ?? cloneConfig(DEFAULT_CONFIG)
}

export async function loadTranslationSettings(): Promise<TranslationSettings> {
  const metadata = readStoredMetadata()
  if (metadata) {
    return translationSettingsFromMetadata(metadata)
  }

  await migrateLegacyConfig()
  const migrated = readStoredMetadata()
  if (migrated) {
    return translationSettingsFromMetadata(migrated)
  }

  const defaults = cloneConfig(DEFAULT_CONFIG)
  const model = defaults.models[0]
  return {
    provider: defaults.translationProvider,
    modelId: model.id,
    baseURL: model.baseURL,
    model: model.model,
  }
}

export async function saveAIConfigs(configs: AIConfigs): Promise<void> {
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

async function writeModelSecret(modelId: string, apiKey: string): Promise<void> {
  const key = modelApiKeyStorageKey(modelId)
  if (apiKey) {
    await secureStorageSet(key, apiKey)
    return
  }
  await secureStorageRemove(key)
}

export async function addAIConfig(config: Omit<AIConfig, 'id'>): Promise<AIConfig> {
  if (!config.name || !config.baseURL || !config.model || typeof config.apiKey !== 'string') {
    throw new Error('AI 配置无效')
  }

  const metadata = await ensureMetadata()
  const newConfig: AIConfig = {
    ...config,
    id: `model-${Date.now()}`,
  }
  metadata.models.push({
    id: newConfig.id,
    name: newConfig.name,
    baseURL: newConfig.baseURL,
    model: newConfig.model,
    hasApiKey: Boolean(newConfig.apiKey),
  })
  writeStoredMetadata(metadata)
  if (newConfig.apiKey) {
    await secureStorageSet(modelApiKeyStorageKey(newConfig.id), newConfig.apiKey)
  }
  return newConfig
}

export async function updateAIConfig(
  id: string,
  config: Partial<Omit<AIConfig, 'id'>>,
): Promise<void> {
  const metadata = await ensureMetadata()
  const current = metadata.models.find(model => model.id === id)
  if (!current) {
    return
  }

  const next = {
    ...current,
    name: config.name ?? current.name,
    baseURL: config.baseURL ?? current.baseURL,
    model: config.model ?? current.model,
  }
  if (!next.name || !next.baseURL || !next.model) {
    throw new Error('AI 配置无效')
  }
  if (config.apiKey !== undefined) {
    next.hasApiKey = Boolean(config.apiKey)
  }
  metadata.models = metadata.models.map(model => model.id === id ? next : model)
  writeStoredMetadata(metadata)
  if (config.apiKey !== undefined) {
    await writeModelSecret(id, config.apiKey)
  }
}

export async function deleteAIConfig(id: string): Promise<string> {
  const metadata = await ensureMetadata()
  if (metadata.models.length <= 1) {
    throw new Error('至少需要保留一个模型配置')
  }
  if (!metadata.models.some(model => model.id === id)) {
    return metadata.activeModelId
  }

  metadata.models = metadata.models.filter(model => model.id !== id)
  if (metadata.activeModelId === id) {
    metadata.activeModelId = metadata.models[0].id
  }
  writeStoredMetadata(metadata)
  await secureStorageRemove(modelApiKeyStorageKey(id))
  return metadata.activeModelId
}

export async function setActiveModel(id: string): Promise<void> {
  const metadata = await ensureMetadata()
  if (!metadata.models.some(model => model.id === id)) {
    return
  }
  metadata.activeModelId = id
  writeStoredMetadata(metadata)
}

export async function setTranslationProvider(provider: TranslationProvider): Promise<void> {
  const metadata = await ensureMetadata()
  metadata.translationProvider = sanitizeTranslationProvider(provider)
  writeStoredMetadata(metadata)
}

export async function resetAIConfig(): Promise<AIConfigs> {
  const metadata = readStoredMetadata()
  await Promise.all((metadata?.models ?? []).map(model => secureStorageRemove(modelApiKeyStorageKey(model.id))))
  try {
    localStorage.removeItem(CONFIG_METADATA_KEY)
    localStorage.removeItem(LEGACY_CONFIG_KEY)
  }
  catch (error) {
    console.error('重置配置失败:', error)
  }
  return cloneConfig(DEFAULT_CONFIG)
}
