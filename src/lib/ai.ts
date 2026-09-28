import type { AIConfig } from './config'
import { invoke } from '@tauri-apps/api/core'
import { logger } from './logger'

export async function testAIConfig(config: AIConfig, signal?: AbortSignal): Promise<void> {
  if (!config.baseURL.trim()) {
    throw new Error('请填写 API Base URL')
  }
  if (!config.model.trim()) {
    throw new Error('请填写模型标识')
  }
  if (!config.apiKey.trim()) {
    throw new Error('请先填写 API Key')
  }

  if (signal?.aborted) {
    throw new DOMException('测试已取消', 'AbortError')
  }

  try {
    await invoke('test_ai_config', {
      baseUrl: config.baseURL,
      apiKey: config.apiKey,
      model: config.model,
    })
  }
  catch (err) {
    logger.error('AI 模型测试失败', err)
    if (typeof err === 'string') {
      throw new TypeError(err)
    }
    throw err
  }
}
