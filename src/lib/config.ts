// AI配置类型定义
export interface AIConfig {
  id: string // 唯一标识
  name: string // 配置名称
  baseURL: string
  apiKey: string
  model: string
}

// 多模型配置类型
export interface AIConfigs {
  models: AIConfig[]
  activeModelId: string // 当前激活的模型ID
}

// 默认配置
// 注意：请用户在 Settings 页面配置自己的 API Key
const DEFAULT_MODELS: AIConfig[] = [
  {
    id: 'default-1',
    name: 'DeepSeek V3',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    apiKey: '', // 请在 Settings 页面配置您的 API Key
    model: 'deepseek-v3-1-terminus',
  },
  {
    id: 'default-2',
    name: 'GPT-4o Mini',
    baseURL: 'https://api.openai.com/v1',
    apiKey: '', // 请在 Settings 页面配置您的 API Key
    model: 'gpt-4o-mini',
  },
]

const DEFAULT_CONFIG: AIConfigs = {
  models: DEFAULT_MODELS,
  activeModelId: 'default-1',
}

const CONFIG_KEY = 'ai_configs'

/**
 * 获取所有AI配置
 */
export function getAllAIConfigs(): AIConfigs {
  try {
    const stored = localStorage.getItem(CONFIG_KEY)
    if (stored) {
      const configs = JSON.parse(stored) as AIConfigs
      // 确保至少有一个模型
      if (configs.models && configs.models.length > 0) {
        return configs
      }
    }
  }
  catch (error) {
    console.error('读取配置失败:', error)
  }
  return DEFAULT_CONFIG
}

/**
 * 获取当前激活的AI配置
 */
export function getAIConfig(): AIConfig {
  const configs = getAllAIConfigs()
  const activeModel = configs.models.find(m => m.id === configs.activeModelId)
  return activeModel || configs.models[0]
}

/**
 * 保存所有AI配置
 */
export function saveAllAIConfigs(configs: AIConfigs): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(configs))
  }
  catch (error) {
    console.error('保存配置失败:', error)
    throw error
  }
}

/**
 * 添加新的AI配置
 */
export function addAIConfig(config: Omit<AIConfig, 'id'>): AIConfig {
  const configs = getAllAIConfigs()
  const newConfig: AIConfig = {
    ...config,
    id: `model-${Date.now()}`,
  }
  configs.models.push(newConfig)
  saveAllAIConfigs(configs)
  return newConfig
}

/**
 * 更新AI配置
 */
export function updateAIConfig(id: string, config: Partial<Omit<AIConfig, 'id'>>): void {
  const configs = getAllAIConfigs()
  const index = configs.models.findIndex(m => m.id === id)
  if (index !== -1) {
    configs.models[index] = { ...configs.models[index], ...config }
    saveAllAIConfigs(configs)
  }
}

/**
 * 删除AI配置
 */
export function deleteAIConfig(id: string): void {
  const configs = getAllAIConfigs()
  // 至少保留一个模型
  if (configs.models.length <= 1) {
    throw new Error('至少需要保留一个模型配置')
  }
  configs.models = configs.models.filter(m => m.id !== id)
  // 如果删除的是当前激活的模型，切换到第一个
  if (configs.activeModelId === id) {
    configs.activeModelId = configs.models[0].id
  }
  saveAllAIConfigs(configs)
}

/**
 * 设置激活的模型
 */
export function setActiveModel(id: string): void {
  const configs = getAllAIConfigs()
  if (configs.models.some(m => m.id === id)) {
    configs.activeModelId = id
    saveAllAIConfigs(configs)
  }
}

/**
 * 重置为默认配置
 */
export function resetAIConfig(): AIConfigs {
  try {
    localStorage.removeItem(CONFIG_KEY)
  }
  catch (error) {
    console.error('重置配置失败:', error)
  }
  return DEFAULT_CONFIG
}
