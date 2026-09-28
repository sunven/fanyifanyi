import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testAIConfig } from '../ai'

const { config, invoke } = vi.hoisted(() => {
  const config = {
    id: 'model-1',
    name: 'DeepSeek V3',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    apiKey: 'sk-test-key',
    model: 'ep-20251028141454-jlhp4',
  }

  return {
    config,
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
