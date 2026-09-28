import { beforeEach, describe, expect, it, vi } from 'vitest'
import { translate } from '../translate'

const { config, getTranslationSettingsLoaded, invoke } = vi.hoisted(() => {
  const config = {
    id: 'model-1',
    name: 'DeepSeek V3',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    apiKey: 'sk-test-key',
    model: 'ep-20251028141454-jlhp4',
  }

  return {
    config,
    getTranslationSettingsLoaded: vi.fn(() => Promise.resolve({
      aiConfig: config,
      provider: 'ai' as const,
    })),
    invoke: vi.fn(),
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
    getTranslationSettingsLoaded,
  }
})

describe('translate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getTranslationSettingsLoaded.mockResolvedValue({
      aiConfig: config,
      provider: 'ai',
    })
    invoke.mockResolvedValue('你好！')
  })

  it('returns an empty string without calling an engine for blank text', async () => {
    await expect(translate('  \n', 'desk')).resolves.toBe('')

    expect(invoke).not.toHaveBeenCalled()
  })

  it('sends the desk bilingual prompt and active model to the AI adapter', async () => {
    await expect(translate('Hello!', 'desk')).resolves.toBe('你好！')

    expect(invoke).toHaveBeenCalledWith('translate_with_ai', {
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'sk-test-key',
      model: 'ep-20251028141454-jlhp4',
      prompt: expect.stringContaining('Hello!'),
    })
    const prompt = invoke.mock.calls[0][1].prompt as string
    expect(prompt).toContain('中英互译')
    expect(prompt).toContain('若待翻译文本为中文，则将其翻译成英文')
  })

  it('asks Google for English when desk text contains CJK', async () => {
    getTranslationSettingsLoaded.mockResolvedValue({
      aiConfig: config,
      provider: 'google',
    })

    await translate('你好', 'desk')

    expect(invoke).toHaveBeenCalledWith('translate_with_google', {
      text: '你好',
      targetLanguage: 'en',
    })
  })

  it('asks Google for Chinese when desk text has no CJK', async () => {
    getTranslationSettingsLoaded.mockResolvedValue({
      aiConfig: config,
      provider: 'google',
    })

    await translate('Hello', 'desk')

    expect(invoke).toHaveBeenCalledWith('translate_with_google', {
      text: 'Hello',
      targetLanguage: 'zh-CN',
    })
  })

  it('uses the same desk target language for Microsoft', async () => {
    getTranslationSettingsLoaded.mockResolvedValue({
      aiConfig: config,
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
    getTranslationSettingsLoaded.mockResolvedValue({
      aiConfig: config,
      provider: 'google',
    })
    await translate('Hello!', 'screenshot')
    expect(invoke).toHaveBeenCalledWith('translate_with_google', {
      text: 'Hello!',
      targetLanguage: 'zh-CN',
    })

    invoke.mockClear()
    getTranslationSettingsLoaded.mockResolvedValue({
      aiConfig: config,
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
})
