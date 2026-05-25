import {
  addAIConfigAsync,
  deleteAIConfigAsync,
  DEFAULT_CONFIG,
  getAIConfigAsync,
  getAllAIConfigsAsync,
  resetAIConfigAsync,
  saveAllAIConfigsAsync,
  setActiveModelAsync,
  updateAIConfigAsync,
} from './config-repository'

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
}

let configCache: AIConfigs = {
  activeModelId: DEFAULT_CONFIG.activeModelId,
  models: DEFAULT_CONFIG.models.map(model => ({ ...model })),
}

function cloneConfig(config: AIConfigs): AIConfigs {
  return {
    activeModelId: config.activeModelId,
    models: config.models.map(model => ({ ...model })),
  }
}

export async function loadAIConfigs(): Promise<AIConfigs> {
  configCache = await getAllAIConfigsAsync()
  return cloneConfig(configCache)
}

export function getAllAIConfigs(): AIConfigs {
  return cloneConfig(configCache)
}

export function getAIConfig(): AIConfig {
  const activeModel = configCache.models.find(model => model.id === configCache.activeModelId)
  return { ...(activeModel ?? configCache.models[0]) }
}

export async function getAIConfigLoaded(): Promise<AIConfig> {
  const config = await getAIConfigAsync()
  configCache = await getAllAIConfigsAsync()
  return config
}

export async function saveAllAIConfigs(configs: AIConfigs): Promise<void> {
  await saveAllAIConfigsAsync(configs)
  configCache = await getAllAIConfigsAsync()
}

export async function addAIConfig(config: Omit<AIConfig, 'id'>): Promise<AIConfig> {
  const newConfig = await addAIConfigAsync(config)
  configCache = await getAllAIConfigsAsync()
  return newConfig
}

export async function updateAIConfig(
  id: string,
  config: Partial<Omit<AIConfig, 'id'>>,
): Promise<void> {
  await updateAIConfigAsync(id, config)
  configCache = await getAllAIConfigsAsync()
}

export async function deleteAIConfig(id: string): Promise<void> {
  await deleteAIConfigAsync(id)
  configCache = await getAllAIConfigsAsync()
}

export async function setActiveModel(id: string): Promise<void> {
  await setActiveModelAsync(id)
  configCache = await getAllAIConfigsAsync()
}

export async function resetAIConfig(): Promise<AIConfigs> {
  configCache = await resetAIConfigAsync()
  return cloneConfig(configCache)
}

void loadAIConfigs().catch(error => {
  console.error('加载 AI 配置失败:', error)
})
