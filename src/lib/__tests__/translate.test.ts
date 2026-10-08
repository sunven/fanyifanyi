import type { TranslationSettings } from '../config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { translate } from '../translate'

const { invoke, loadTranslationSettings, settings } = vi.hoisted(() => {
  const settings: TranslationSettings = {
    provider: 'ai',
    modelId: 'model-1',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'ep-20251028141454-jlhp4',
  }

  return {
    invoke: vi.fn(),
    loadTranslationSettings: vi.fn(() => Promise.resolve(settings)),
    settings,
  }
})

vi.mock('@tauri-apps/api/core', () => ({
  invoke,
}))

vi.mock('../logger', () => ({
  logger: {
    error: vi.fn(),
  },
}))

vi.mock('../config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../config')>()
  return {
    ...original,
    loadTranslationSettings,
  }
})

describe('translate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadTranslationSettings.mockResolvedValue(settings)
    invoke.mockResolvedValue('你好！')
  })

  it('returns no result without calling an engine for blank text', async () => {
    await expect(translate('  \n', 'desk')).resolves.toBeNull()

    expect(invoke).not.toHaveBeenCalled()
  })

  it('sends the desk bilingual prompt and active model to the AI adapter', async () => {
    await expect(translate('Hello!', 'desk')).resolves.toMatchObject({ text: '你好！', engine: { provider: 'ai', modelId: 'model-1' } })

    expect(invoke).toHaveBeenCalledWith('translate_with_ai', {
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      model: 'ep-20251028141454-jlhp4',
      modelId: 'model-1',
      prompt: expect.stringContaining('Hello!'),
    })
    expect(invoke.mock.calls[0][1]).not.toHaveProperty('apiKey')
    const prompt = invoke.mock.calls[0][1].prompt as string
    expect(prompt).toContain('中英互译')
    expect(prompt).toContain('若待翻译文本为中文，则将其翻译成英文')
  })

  it('asks Google for English when desk text contains CJK', async () => {
    loadTranslationSettings.mockResolvedValue({
      ...settings,
      provider: 'google',
    })

    await translate('你好', 'desk')

    expect(invoke).toHaveBeenCalledWith('translate_with_google', {
      text: '你好',
      targetLanguage: 'en',
    })
  })

  it('asks Google for Chinese when desk text has no CJK', async () => {
    loadTranslationSettings.mockResolvedValue({
      ...settings,
      provider: 'google',
    })

    await translate('Hello', 'desk')

    expect(invoke).toHaveBeenCalledWith('translate_with_google', {
      text: 'Hello',
      targetLanguage: 'zh-CN',
    })
  })

  it('uses the same desk target language for Microsoft', async () => {
    loadTranslationSettings.mockResolvedValue({
      ...settings,
      provider: 'microsoft',
    })

    await translate('Hello', 'desk')

    expect(invoke).toHaveBeenCalledWith('translate_with_microsoft', {
      text: 'Hello',
      targetLanguage: 'zh-CN',
    })
  })

  it('sends the fixed Chinese screenshot prompt to the AI adapter', async () => {
    await translate('你好\nHello', 'screenshot')

    const prompt = invoke.mock.calls[0][1].prompt as string
    expect(prompt).toContain('英文文本')
    expect(prompt).toContain('翻译成中文')
    expect(prompt).toContain('你好\nHello')
    expect(prompt).not.toContain('中文，则将其翻译成英文')
  })

  it('asks Google and Microsoft for Chinese during screenshot translation', async () => {
    loadTranslationSettings.mockResolvedValue({
      ...settings,
      provider: 'google',
    })
    await translate('Hello!', 'screenshot')
    expect(invoke).toHaveBeenCalledWith('translate_with_google', {
      text: 'Hello!',
      targetLanguage: 'zh-CN',
    })

    invoke.mockClear()
    loadTranslationSettings.mockResolvedValue({
      ...settings,
      provider: 'microsoft',
    })
    await translate('Hello!', 'screenshot')
    expect(invoke).toHaveBeenCalledWith('translate_with_microsoft', {
      text: 'Hello!',
      targetLanguage: 'zh-CN',
    })
  })

  it('withholds the result when translation is cancelled', async () => {
    const signal = new AbortController()
    signal.abort()

    await expect(translate('Hello!', 'desk', signal.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('withholds a finished engine result when cancelled while waiting', async () => {
    let finish: (value: string) => void = () => {}
    invoke.mockReturnValue(new Promise((resolve) => {
      finish = resolve
    }))
    const signal = new AbortController()

    const pending = translate('Hello!', 'desk', signal.signal)
    await vi.waitFor(() => expect(invoke).toHaveBeenCalled())
    signal.abort()
    finish('你好！')

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('wraps engine string errors as Error messages', async () => {
    invoke.mockRejectedValue('认证失败，请检查 API Key')

    await expect(translate('Hello!', 'desk')).rejects.toThrow('认证失败，请检查 API Key')
  })

  it('returns the actual engine with a one-request override', async () => {
    loadTranslationSettings.mockResolvedValue({ ...settings, provider: 'microsoft' })

    const result = await translate('Hello', 'desk', undefined, { provider: 'microsoft' })

    expect(loadTranslationSettings).toHaveBeenCalledWith({ provider: 'microsoft' })
    expect(result).toEqual({ text: '你好！', engine: { provider: 'microsoft' } })
  })
})
