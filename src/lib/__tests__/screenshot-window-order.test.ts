import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openScreenshotSelectionWindow } from '../screenshot-translation'

const {
  appWindow,
  createWebviewWindow,
  cursorPosition,
  invoke,
  monitorFromPoint,
  selectionWindow,
} = vi.hoisted(() => ({
  appWindow: {
    hide: vi.fn(),
    show: vi.fn(),
  },
  createWebviewWindow: vi.fn(),
  cursorPosition: vi.fn(),
  invoke: vi.fn(),
  monitorFromPoint: vi.fn(),
  selectionWindow: {
    once: vi.fn(),
  },
}))

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: vi.fn(),
  invoke,
}))

vi.mock('@tauri-apps/api/window', () => ({
  cursorPosition,
  getCurrentWindow: () => appWindow,
  monitorFromPoint,
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: class MockWebviewWindow {
    constructor(label: string, options: unknown) {
      createWebviewWindow(label, options)
    }

    once(event: string, handler: (event: { payload: unknown }) => void) {
      return selectionWindow.once(event, handler)
    }
  },
}))

vi.mock('../config', () => ({
  getTranslationSettingsLoaded: vi.fn(),
}))

describe('screenshot selection window order', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    appWindow.hide.mockResolvedValue(undefined)
    appWindow.show.mockResolvedValue(undefined)
    cursorPosition.mockResolvedValue({ x: 120, y: 80 })
    monitorFromPoint.mockResolvedValue({
      position: {
        x: 0,
        y: 0,
        toLogical: () => ({ x: 0, y: 0 }),
      },
      size: {
        width: 1600,
        height: 1000,
        toLogical: () => ({ width: 800, height: 500 }),
      },
      scaleFactor: 2,
    })
    invoke.mockResolvedValue({ imagePath: '/tmp/fanyifanyi-screen-order.png' })
    selectionWindow.once.mockImplementation((event, handler) => {
      if (event === 'tauri://created') {
        queueMicrotask(() => handler({ payload: null }))
      }
      return Promise.resolve(vi.fn())
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the main window hidden until the selection window is ready', async () => {
    const opening = openScreenshotSelectionWindow()

    await vi.advanceTimersByTimeAsync(120)
    await opening

    expect(appWindow.hide).toHaveBeenCalledTimes(1)
    expect(createWebviewWindow).toHaveBeenCalledTimes(1)
    expect(appWindow.show).not.toHaveBeenCalled()
  })

  it('restores the main window when screen capture fails', async () => {
    invoke.mockRejectedValueOnce(new Error('capture failed'))
    const opening = openScreenshotSelectionWindow()
    const rejection = expect(opening).rejects.toThrow('capture failed')

    await vi.advanceTimersByTimeAsync(120)

    await rejection
    expect(appWindow.show).toHaveBeenCalledTimes(1)
  })

  it('restores the main window when the selection window cannot be created', async () => {
    selectionWindow.once.mockImplementation((event, handler) => {
      if (event === 'tauri://error') {
        queueMicrotask(() => handler({ payload: 'create failed' }))
      }
      return Promise.resolve(vi.fn())
    })
    const opening = openScreenshotSelectionWindow()
    const rejection = expect(opening).rejects.toThrow('create failed')

    await vi.advanceTimersByTimeAsync(120)

    await rejection
    expect(appWindow.show).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('delete_screenshot_file', {
      imagePath: '/tmp/fanyifanyi-screen-order.png',
    })
  })
})
