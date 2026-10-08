import type { TranslationSettings, TranslationTarget } from './config'
import { invoke } from '@tauri-apps/api/core'
import { loadTranslationSettings } from './config'
import { logger } from './logger'

export type TranslationKind = 'desk' | 'screenshot'

export interface TranslationEngine extends TranslationTarget {
  modelName?: string
}

export interface TranslationResult {
  text: string
  engine: TranslationEngine
}

export class TranslationError extends Error {
  constructor(message: string, readonly engine: TranslationEngine) {
    super(message)
    this.name = 'TranslationError'
  }
}

export function translationEngineLabel(engine: TranslationEngine) {
  if (engine.provider === 'ai') {
    return engine.modelName ?? 'AI 翻译'
  }
  return engine.provider === 'google' ? 'Google 翻译' : 'Microsoft 翻译'
}

function isAbortError(err: unknown) {
  return err instanceof Error && err.name === 'AbortError'
}

function cancelledTranslation() {
  return new DOMException('翻译已取消', 'AbortError')
}

function containsCjk(text: string) {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (
      (code >= 0x3400 && code <= 0x4DBF)
      || (code >= 0x4E00 && code <= 0x9FFF)
      || (code >= 0xF900 && code <= 0xFAFF)
      || (code >= 0x20000 && code <= 0x2A6DF)
      || (code >= 0x2A700 && code <= 0x2B73F)
      || (code >= 0x2B740 && code <= 0x2B81F)
      || (code >= 0x2B820 && code <= 0x2CEAF)
    ) {
      return true
    }
  }
  return false
}

function deskTargetLanguage(text: string) {
  return containsCjk(text) ? 'en' : 'zh-CN'
}

function deskTranslationPrompt(text: string) {
  return `你的任务是自动判断待翻译文本的语言并进行中英互译。若待翻译文本为中文，则将其翻译成英文；若待翻译文本为英文，则将其翻译成中文。请仔细阅读以下信息，并完成翻译。

待翻译文本:
<text>
${text}
</text>

在进行翻译时，请遵循以下指南:
1. 确保翻译准确传达原文的意思。
2. 尽量使用自然、流畅的表达方式。
3. 注意语法和拼写的正确性。

请直接输出翻译结果，不需要添加任何标签或说明。`
}

function screenshotTranslationPrompt(text: string) {
  return `你的任务是把截图 OCR 得到的英文文本翻译成中文。请只输出中文译文，不要解释、不要添加标签。

英文文本:
<text>
${text}
</text>`
}

async function requestTranslation(
  text: string,
  kind: TranslationKind,
  settings: TranslationSettings,
) {
  if (settings.provider === 'ai') {
    return invoke<string>('translate_with_ai', {
      baseUrl: settings.baseURL,
      model: settings.model,
      modelId: settings.modelId,
      prompt: kind === 'desk' ? deskTranslationPrompt(text) : screenshotTranslationPrompt(text),
    })
  }

  return invoke<string>(
    settings.provider === 'google' ? 'translate_with_google' : 'translate_with_microsoft',
    {
      text,
      targetLanguage: kind === 'screenshot' ? 'zh-CN' : deskTargetLanguage(text),
    },
  )
}

export async function translate(
  text: string,
  kind: TranslationKind,
  signal?: AbortSignal,
  target?: TranslationTarget,
): Promise<TranslationResult | null> {
  if (signal?.aborted) {
    throw cancelledTranslation()
  }
  if (!text.trim()) {
    return null
  }

  const settings = await loadTranslationSettings(target)
  if (signal?.aborted) {
    throw cancelledTranslation()
  }

  const engine: TranslationEngine = settings.provider === 'ai'
    ? { provider: 'ai', modelId: settings.modelId, modelName: settings.modelName ?? settings.model }
    : { provider: settings.provider }
  try {
    const content = await requestTranslation(text, kind, settings)
    if (signal?.aborted) {
      throw cancelledTranslation()
    }
    return {
      text: content,
      engine,
    }
  }
  catch (err) {
    if (signal?.aborted || isAbortError(err)) {
      throw cancelledTranslation()
    }
    logger.error('Tauri 翻译请求失败', err)
    throw new TranslationError(err instanceof Error ? err.message : String(err), engine)
  }
}
