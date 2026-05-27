import type { AIConfig } from './config'
import { invoke } from '@tauri-apps/api/core'
import { getTranslationSettingsLoaded } from './config'
import { logger } from './logger'

function isAbortError(err: unknown) {
  return err instanceof Error && err.name === 'AbortError'
}

export async function* translateStream(
  text: string,
  signal?: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  const { aiConfig, provider } = await getTranslationSettingsLoaded()

  if (signal?.aborted) {
    return
  }

  try {
    const content = provider === 'ai'
      ? await invoke<string>('translate_text', {
          baseUrl: aiConfig.baseURL,
          apiKey: aiConfig.apiKey,
          model: aiConfig.model,
          text,
        })
      : await invoke<string>(
          provider === 'google' ? 'translate_with_google' : 'translate_with_microsoft',
          { text },
        )
    if (!signal?.aborted && content) {
      yield content
    }
  }
  catch (err) {
    if (signal?.aborted || isAbortError(err)) {
      return
    }
    logger.error('Tauri 翻译请求失败', err)
    if (typeof err === 'string') {
      throw new TypeError(err)
    }
    throw err
  }
}

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
