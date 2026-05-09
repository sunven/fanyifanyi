import type { AIConfig } from '../config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testAIConfig } from '../ai'

const { createCompletion, invoke, isTauri, openAIConstructor } = vi.hoisted(() => {
  const createCompletion = vi.fn()

  return {
    createCompletion,
    invoke: vi.fn(),
    isTauri: vi.fn(),
    openAIConstructor: vi.fn(function OpenAIMock() {
      return {
      chat: {
        completions: {
          create: createCompletion,
        },
      },
      }
    }),
  }
})

vi.mock('@tauri-apps/api/core', () => ({
  invoke,
  isTauri,
}))

vi.mock('openai', () => ({
  default: openAIConstructor,
}))

vi.mock('../logger', () => ({
  logger: {
    error: vi.fn(),
  },
}))

const config: AIConfig = {
  id: 'model-1',
  name: 'DeepSeek V3',
  baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
  apiKey: 'sk-test-key',
  model: 'ep-20251028141454-jlhp4',
}

describe('testAIConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isTauri.mockReturnValue(true)
    invoke.mockResolvedValue(undefined)
    createCompletion.mockResolvedValue({})
  })

  it('uses the Tauri command in the desktop app', async () => {
    await testAIConfig(config)

    expect(invoke).toHaveBeenCalledWith('test_ai_config', {
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'sk-test-key',
      model: 'ep-20251028141454-jlhp4',
    })
    expect(openAIConstructor).not.toHaveBeenCalled()
  })

  it('wraps Tauri string errors as Error messages', async () => {
    invoke.mockRejectedValue('认证失败，请检查 API Key')

    await expect(testAIConfig(config)).rejects.toThrow('认证失败，请检查 API Key')
  })

  it('falls back to the OpenAI SDK outside Tauri', async () => {
    isTauri.mockReturnValue(false)

    await testAIConfig(config)

    expect(invoke).not.toHaveBeenCalled()
    expect(openAIConstructor).toHaveBeenCalledWith({
      baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'sk-test-key',
      dangerouslyAllowBrowser: true,
    })
    expect(createCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'ep-20251028141454-jlhp4',
        max_tokens: 8,
      }),
      { signal: undefined },
    )
  })
})
