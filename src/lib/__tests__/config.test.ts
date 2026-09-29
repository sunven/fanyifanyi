import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addAIConfig, deleteAIConfig, loadAIConfigs, loadTranslationSettings, resetAIConfig, saveAIConfigs, setActiveModel, setTranslationProvider, updateAIConfig } from '../config'

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

async function seedTwoModels() {
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
  secureStorageGet.mockClear()
}

describe('catalog writes stay off unrelated secrets', () => {
  beforeEach(() => {
    localStorage.clear()
    secureStorageGet.mockClear()
  })

  it('changes the translation provider without reading saved keys', async () => {
    await seedTwoModels()

    await setTranslationProvider('google')

    expect(secureStorageGet).not.toHaveBeenCalled()
    expect(localStorage.getItem('secure:ai-config:model:model-1:apiKey')).toBe('sk-one')
    expect(localStorage.getItem('secure:ai-config:model:model-2:apiKey')).toBe('sk-two')
    const stored = JSON.parse(localStorage.getItem('ai_config_metadata_v1') ?? '{}')
    expect(stored.translationProvider).toBe('google')
    expect(stored.models.map((model: { hasApiKey?: boolean }) => model.hasApiKey)).toEqual([true, true])
  })

  it('changes the active model without reading saved keys', async () => {
    await seedTwoModels()

    await setActiveModel('model-2')

    expect(secureStorageGet).not.toHaveBeenCalled()
    expect(localStorage.getItem('secure:ai-config:model:model-1:apiKey')).toBe('sk-one')
    const stored = JSON.parse(localStorage.getItem('ai_config_metadata_v1') ?? '{}')
    expect(stored.activeModelId).toBe('model-2')
  })

  it('writes only the edited model secret', async () => {
    await seedTwoModels()

    await updateAIConfig('model-1', {
      name: 'Renamed',
      baseURL: 'https://example.com/v1',
      model: 'one',
      apiKey: 'sk-one-new',
    })

    expect(secureStorageGet).not.toHaveBeenCalled()
    expect(localStorage.getItem('secure:ai-config:model:model-1:apiKey')).toBe('sk-one-new')
    expect(localStorage.getItem('secure:ai-config:model:model-2:apiKey')).toBe('sk-two')
    const stored = JSON.parse(localStorage.getItem('ai_config_metadata_v1') ?? '{}')
    expect(stored.models[0]).toMatchObject({ name: 'Renamed', hasApiKey: true })
    expect(stored.models[1]).toMatchObject({ name: 'Model Two', hasApiKey: true })
  })

  it('removes only the cleared model secret', async () => {
    await seedTwoModels()

    await updateAIConfig('model-1', { apiKey: '' })

    expect(secureStorageGet).not.toHaveBeenCalled()
    expect(localStorage.getItem('secure:ai-config:model:model-1:apiKey')).toBeNull()
    expect(localStorage.getItem('secure:ai-config:model:model-2:apiKey')).toBe('sk-two')
  })

  it('stores only the new model secret', async () => {
    await seedTwoModels()

    const created = await addAIConfig({
      name: 'Model Three',
      baseURL: 'https://example.com/v1',
      apiKey: 'sk-three',
      model: 'three',
    })

    expect(secureStorageGet).not.toHaveBeenCalled()
    expect(created.apiKey).toBe('sk-three')
    expect(localStorage.getItem(`secure:ai-config:model:${created.id}:apiKey`)).toBe('sk-three')
    expect(localStorage.getItem('secure:ai-config:model:model-1:apiKey')).toBe('sk-one')
    expect(localStorage.getItem('secure:ai-config:model:model-2:apiKey')).toBe('sk-two')
  })

  it('returns the next active model and removes only the deleted secret', async () => {
    await seedTwoModels()

    await expect(deleteAIConfig('model-1')).resolves.toBe('model-2')

    expect(secureStorageGet).not.toHaveBeenCalled()
    expect(localStorage.getItem('secure:ai-config:model:model-1:apiKey')).toBeNull()
    expect(localStorage.getItem('secure:ai-config:model:model-2:apiKey')).toBe('sk-two')
    const stored = JSON.parse(localStorage.getItem('ai_config_metadata_v1') ?? '{}')
    expect(stored.activeModelId).toBe('model-2')
    expect(stored.models).toHaveLength(1)
  })

  it('resets from metadata ids without reading secret values', async () => {
    await seedTwoModels()

    await expect(resetAIConfig()).resolves.toMatchObject({
      activeModelId: 'default-1',
      translationProvider: 'google',
    })

    expect(secureStorageGet).not.toHaveBeenCalled()
    expect(localStorage.getItem('secure:ai-config:model:model-1:apiKey')).toBeNull()
    expect(localStorage.getItem('secure:ai-config:model:model-2:apiKey')).toBeNull()
    expect(localStorage.getItem('ai_config_metadata_v1')).toBeNull()
  })
})
