import OpenAI from 'openai'
import { getAIConfig } from './config'
import { logger } from './logger'

export async function* translateStream(
  text: string,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const config = getAIConfig()

  const client = new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    dangerouslyAllowBrowser: true,
  })

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
