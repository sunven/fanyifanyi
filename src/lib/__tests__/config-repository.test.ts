import { describe, expect, it } from 'vitest'
import { getAllAIConfigsAsync, saveAllAIConfigsAsync } from '../config-repository'

describe('config repository', () => {
  it('removes secure API keys for models removed by a replacement save', async () => {
    await saveAllAIConfigsAsync({
      activeModelId: 'model-1',
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

    await saveAllAIConfigsAsync({
      activeModelId: 'model-1',
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

    const reloaded = await getAllAIConfigsAsync()
    expect(reloaded.models).toHaveLength(1)
    expect(reloaded.models[0]).toMatchObject({
      id: 'model-1',
      apiKey: 'sk-one',
    })
  })
})
