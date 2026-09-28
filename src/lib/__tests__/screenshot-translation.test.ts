import { beforeEach, describe, expect, it, vi } from 'vitest'
import { discardSelection, selectionFrame, takeOverlayText, translateSelection } from '../screenshot-translation'

const { createWebviewWindow, invoke, translate } = vi.hoisted(() => ({
  createWebviewWindow: vi.fn(),
  invoke: vi.fn(),
  translate: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
  invoke,
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: class MockWebviewWindow {
    constructor(label: string, options: unknown) {
      createWebviewWindow(label, options)
    }

    once(event: string, handler: (event: { payload: unknown }) => void) {
      if (event === 'tauri://created') {
        queueMicrotask(() => handler({ payload: null }))
      }
      return Promise.resolve(vi.fn())
    }
  },
}))

vi.mock('../translate', () => ({
  translate,
}))

const selection = { x: 10, y: 20, width: 30, height: 40 }

function showSelectionWindow() {
  const search = new URLSearchParams({
    imagePath: '/tmp/shot.png',
    screenX: '0',
    screenY: '0',
    screenWidth: '1600',
    screenHeight: '1000',
    scaleFactor: '2',
    logicalX: '100',
    logicalY: '200',
    logicalWidth: '800',
    logicalHeight: '500',
  })
  window.history.replaceState({}, '', `/?${search.toString()}`)
}

describe('screenshot translation session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invoke.mockResolvedValue('Hello')
    translate.mockResolvedValue('你好')
    showSelectionWindow()
  })

  it('shows the selection window only the image and logical size', () => {
    expect(selectionFrame()).toEqual({
      imageSrc: 'asset:///tmp/shot.png',
      logicalWidth: 800,
      logicalHeight: 500,
    })
  })

  it('turns a css rectangle into the ocr region and overlay rect', async () => {
    await translateSelection(selection)

    expect(invoke).toHaveBeenCalledWith('recognize_screenshot_text', {
      imagePath: '/tmp/shot.png',
      imageRegion: { x: 20, y: 40, width: 60, height: 80 },
      imageWidth: 1600,
      imageHeight: 1000,
    })
    expect(translate).toHaveBeenCalledWith('Hello', 'screenshot')
    expect(createWebviewWindow).toHaveBeenCalledWith(
      expect.stringMatching(/^translation-overlay-/),
      expect.objectContaining({
        x: 110,
        y: 220,
        width: 30,
        height: 40,
      }),
    )
    expect(invoke).toHaveBeenCalledWith('delete_screenshot_file', {
      imagePath: '/tmp/shot.png',
    })
  })

  it('opens an overlay for empty ocr text and still discards the capture', async () => {
    invoke.mockResolvedValueOnce('')
    translate.mockResolvedValueOnce('')

    await translateSelection(selection)

    expect(translate).toHaveBeenCalledWith('', 'screenshot')
    expect(createWebviewWindow).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('delete_screenshot_file', {
      imagePath: '/tmp/shot.png',
    })
  })

  it('keeps the capture when translation fails', async () => {
    translate.mockRejectedValueOnce(new Error('翻译失败'))

    await expect(translateSelection(selection)).rejects.toThrow('翻译失败')
    expect(invoke).not.toHaveBeenCalledWith('delete_screenshot_file', {
      imagePath: '/tmp/shot.png',
    })
  })

  it('discards the capture from the current window and ignores a repeated discard', async () => {
    await discardSelection()
    await discardSelection()

    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke).toHaveBeenNthCalledWith(1, 'delete_screenshot_file', {
      imagePath: '/tmp/shot.png',
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'delete_screenshot_file', {
      imagePath: '/tmp/shot.png',
    })
  })

  it('returns overlay text once', () => {
    window.history.replaceState({}, '', '/?window=translation-overlay&label=test-overlay')
    localStorage.setItem('translation-overlay:test-overlay', JSON.stringify({
      x: 110,
      y: 220,
      width: 30,
      height: 40,
      text: '你好',
    }))

    expect(takeOverlayText()).toBe('你好')
    expect(takeOverlayText()).toBeNull()
    expect(localStorage.getItem('translation-overlay:test-overlay')).toBeNull()
  })
})
