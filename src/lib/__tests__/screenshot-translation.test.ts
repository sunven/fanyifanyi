import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteScreenshotFile, readSelectionWindowParams, translateScreenshotText } from '../screenshot-translation'

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
      provider: 'ai',
    })),
    invoke: vi.fn(),
  }
})

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
  invoke,
}))

vi.mock('../config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../config')>()
  return {
    ...original,
    getTranslationSettingsLoaded,
  }
})

describe('translateScreenshotText', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invoke.mockResolvedValue('你好！')
    getTranslationSettingsLoaded.mockResolvedValue({
      aiConfig: config,
      provider: 'ai',
    })
  })

  it('uses the fixed English-to-Chinese AI command', async () => {
    await expect(translateScreenshotText('Hello!')).resolves.toBe('你好！')

    expect(invoke).toHaveBeenCalledWith('translate_text_to_chinese', {
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'sk-test-key',
      model: 'ep-20251028141454-jlhp4',
      text: 'Hello!',
    })
  })

  it('deletes a captured screenshot through the backend command', async () => {
    await deleteScreenshotFile('/tmp/fanyifanyi-screen-test.png')

    expect(invoke).toHaveBeenCalledWith('delete_screenshot_file', {
      imagePath: '/tmp/fanyifanyi-screen-test.png',
    })
  })

  it('reads the pre-captured screenshot path from selection window params', () => {
    expect(readSelectionWindowParams('?imagePath=%2Ftmp%2Fshot.png&screenX=1&screenY=2&screenWidth=3&screenHeight=4&scaleFactor=2&logicalX=5&logicalY=6&logicalWidth=7&logicalHeight=8')).toMatchObject({
      imagePath: '/tmp/shot.png',
      screenX: 1,
      logicalWidth: 7,
    })
  })

  it('uses the fixed Google target command', async () => {
    getTranslationSettingsLoaded.mockResolvedValue({
      aiConfig: config,
      provider: 'google',
    })

    await translateScreenshotText('Hello!')

    expect(invoke).toHaveBeenCalledWith('translate_with_google_to_chinese', {
      text: 'Hello!',
    })
  })

  it('uses the fixed Microsoft target command', async () => {
    getTranslationSettingsLoaded.mockResolvedValue({
      aiConfig: config,
      provider: 'microsoft',
    })

    await translateScreenshotText('Hello!')

    expect(invoke).toHaveBeenCalledWith('translate_with_microsoft_to_chinese', {
      text: 'Hello!',
    })
  })
})
