import { invoke, isTauri } from '@tauri-apps/api/core'
import OpenAI from 'openai'
import type { AIConfig } from './config'
import { getAIConfig } from './config'
import { logger } from './logger'

function createClient(config: AIConfig) {
  return new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    dangerouslyAllowBrowser: true,
  })
}

export async function* translateStream(
  text: string,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const config = getAIConfig()

  const client = createClient(config)

  let stream
  try {
    stream = await client.chat.completions.create(
      {
        model: config.model,
        stream: true,
        messages: [
          {
            role: 'user',
            content: `你的任务是自动判断待翻译文本的语言并进行中英互译。若待翻译文本为中文，则将其翻译成英文；若待翻译文本为英文，则将其翻译成中文。请仔细阅读以下信息，并完成翻译。

待翻译文本:
<text>
${text}
</text>

在进行翻译时，请遵循以下指南:
1. 确保翻译准确传达原文的意思。
2. 尽量使用自然、流畅的表达方式。
3. 注意语法和拼写的正确性。

请直接输出翻译结果，不需要添加任何标签或说明。`,
          },
        ],
      },
      {
        signal,
      }
    )
  }
  catch (err) {
    logger.error('OpenAI API 请求失败', err)
    throw err
  }

  for await (const chunk of stream) {
    // 检查是否已取消
    if (signal?.aborted) {
      return
    }
    const content = chunk.choices[0]?.delta?.content
    if (content) {
      yield content
    }
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

  if (isTauri()) {
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
        throw new Error(err)
      }
      throw err
    }
    return
  }

  const client = createClient(config)

  try {
    await client.chat.completions.create(
      {
        model: config.model,
        max_tokens: 8,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: 'Reply with OK.',
          },
        ],
      },
      {
        signal,
      },
    )
  }
  catch (err) {
    logger.error('AI 模型测试失败', err)
    throw err
  }
}
