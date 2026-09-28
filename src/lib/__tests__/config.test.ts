import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadAIConfigs, loadTranslationSettings, saveAIConfigs } from '../config'

const { secureStorageGet } = vi.hoisted(() => ({
  secureStorageGet: vi.fn(),
}))

vi.mock('../secure-storage', async (importOriginal) => {
  const original = await importOriginal<typeof import('../secure-storage')>()
  secureStorageGet.mockImplementation(original.secureStorageGet)
  return {
    ...original,
    secureStorageGet,
  }
})

describe('config', () => {
  beforeEach(() => {
    secureStorageGet.mockClear()
  })

  it('uses Google as the default translation provider', async () => {
    const configs = await loadAIConfigs()

    expect(configs.translationProvider).toBe('google')
  })

  it('removes secure API keys for models removed by a replacement save', async () => {
    await saveAIConfigs({
      activeModelId: 'model-1',
      translationProvider: 'ai',
      models: [
        {
          id: 'model-1',
          name: 'Model One',
          baseURL: 'https://example.com/v1',
          apiKey: 'sk-one',
          model: 'one',
        },
        {
          id: 'model-2',
          name: 'Model Two',
          baseURL: 'https://example.com/v1',
          apiKey: 'sk-two',
          model: 'two',
        },
      ],
    })

    expect(localStorage.getItem('secure:ai-config:model:model-2:apiKey')).toBe('sk-two')

    await saveAIConfigs({
      activeModelId: 'model-1',
      translationProvider: 'ai',
      models: [
        {
          id: 'model-1',
          name: 'Model One',
          baseURL: 'https://example.com/v1',
          apiKey: 'sk-one',
          model: 'one',
        },
      ],
    })

    expect(localStorage.getItem('secure:ai-config:model:model-1:apiKey')).toBe('sk-one')
    expect(localStorage.getItem('secure:ai-config:model:model-2:apiKey')).toBeNull()

    const reloaded = await loadAIConfigs()
    expect(reloaded.models).toHaveLength(1)
    expect(reloaded.models[0]).toMatchObject({
      id: 'model-1',
      apiKey: 'sk-one',
    })
  })

  it('preserves the selected translation provider in metadata', async () => {
    await saveAIConfigs({
      activeModelId: 'model-1',
      translationProvider: 'google',
      models: [
        {
          id: 'model-1',
          name: 'Model One',
          baseURL: 'https://example.com/v1',
          apiKey: '',
          model: 'one',
        },
      ],
    })

    const reloaded = await loadAIConfigs()
    expect(reloaded.translationProvider).toBe('google')
  })

  it('preserves AI as a selected translation provider', async () => {
    await saveAIConfigs({
      activeModelId: 'model-1',
      translationProvider: 'ai',
      models: [
        {
          id: 'model-1',
          name: 'Model One',
          baseURL: 'https://example.com/v1',
          apiKey: '',
          model: 'one',
        },
      ],
    })

    const reloaded = await loadAIConfigs()
    expect(reloaded.translationProvider).toBe('ai')
  })

  it('preserves Microsoft as a selected translation provider', async () => {
    await saveAIConfigs({
      activeModelId: 'model-1',
      translationProvider: 'microsoft',
      models: [
        {
          id: 'model-1',
          name: 'Model One',
          baseURL: 'https://example.com/v1',
          apiKey: '',
          model: 'one',
        },
      ],
    })

    const reloaded = await loadAIConfigs()
    expect(reloaded.translationProvider).toBe('microsoft')
  })

  it('reads translation settings without loading saved keys', async () => {
    await saveAIConfigs({
      activeModelId: 'model-1',
      translationProvider: 'ai',
      models: [
        {
          id: 'model-1',
          name: 'Model One',
          baseURL: 'https://example.com/v1',
          apiKey: 'sk-one',
          model: 'one',
        },
      ],
    })
    secureStorageGet.mockClear()

    await expect(loadTranslationSettings()).resolves.toEqual({
      provider: 'ai',
      modelId: 'model-1',
      baseURL: 'https://example.com/v1',
      model: 'one',
    })
    expect(secureStorageGet).not.toHaveBeenCalled()
  })
})
