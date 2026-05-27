import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testAIConfig, translateStream } from '../ai'

const { config, getAIConfigLoaded, getTranslationSettingsLoaded, invoke } = vi.hoisted(() => {
  const config = {
    id: 'model-1',
    name: 'DeepSeek V3',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    apiKey: 'sk-test-key',
    model: 'ep-20251028141454-jlhp4',
  }

  return {
    config,
    getAIConfigLoaded: vi.fn(() => Promise.resolve(config)),
    getTranslationSettingsLoaded: vi.fn(() => Promise.resolve({
      aiConfig: config,
      provider: 'ai',
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
    getAIConfigLoaded,
    getTranslationSettingsLoaded,
  }
})

describe('testAIConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invoke.mockResolvedValue(undefined)
  })

  it('uses the Tauri command in the desktop app', async () => {
    await testAIConfig(config)

    expect(invoke).toHaveBeenCalledWith('test_ai_config', {
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'sk-test-key',
      model: 'ep-20251028141454-jlhp4',
    })
  })

  it('wraps Tauri string errors as Error messages', async () => {
    invoke.mockRejectedValue('认证失败，请检查 API Key')

    await expect(testAIConfig(config)).rejects.toThrow('认证失败，请检查 API Key')
  })
})

describe('translateStream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getTranslationSettingsLoaded.mockResolvedValue({
      aiConfig: config,
      provider: 'ai',
    })
  })

  it('uses the Tauri translation command in the desktop app', async () => {
    invoke.mockResolvedValue('你好！')

    const chunks = []
    for await (const chunk of translateStream('Hello!')) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual(['你好！'])
    expect(invoke).toHaveBeenCalledWith('translate_text', {
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'sk-test-key',
      model: 'ep-20251028141454-jlhp4',
      text: 'Hello!',
    })
  })

  it('uses the Google translation command when selected', async () => {
    getTranslationSettingsLoaded.mockResolvedValue({
      aiConfig: config,
      provider: 'google',
    })
    invoke.mockResolvedValue('你好！')

    const chunks = []
    for await (const chunk of translateStream('Hello!')) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual(['你好！'])
    expect(invoke).toHaveBeenCalledWith('translate_with_google', {
      text: 'Hello!',
    })
  })

  it('uses the Microsoft translation command when selected', async () => {
    getTranslationSettingsLoaded.mockResolvedValue({
      aiConfig: config,
      provider: 'microsoft',
    })
    invoke.mockResolvedValue('你好！')

    const chunks = []
    for await (const chunk of translateStream('Hello!')) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual(['你好！'])
    expect(invoke).toHaveBeenCalledWith('translate_with_microsoft', {
      text: 'Hello!',
    })
  })

  it('wraps Tauri translation string errors as Error messages', async () => {
    invoke.mockRejectedValue('认证失败，请检查 API Key')

    await expect(async () => {
      for await (const _chunk of translateStream('Hello!')) {
        // consume generator
      }
    }).rejects.toThrow('认证失败，请检查 API Key')
  })
})
