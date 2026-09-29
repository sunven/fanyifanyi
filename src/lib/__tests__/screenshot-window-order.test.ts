import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindAppWindowClose, startScreenshotTranslation } from '../screenshot-translation'

const {
  appWindow,
  createWebviewWindow,
  cursorPosition,
  getAllWindows,
  invoke,
  isTauri,
  monitorFromPoint,
  selectionWindow,
} = vi.hoisted(() => ({
  appWindow: {
    destroy: vi.fn(),
    hide: vi.fn(),
    onCloseRequested: vi.fn(),
    show: vi.fn(),
  },
  createWebviewWindow: vi.fn(),
  cursorPosition: vi.fn(),
  getAllWindows: vi.fn(),
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
  monitorFromPoint: vi.fn(),
  selectionWindow: {
    once: vi.fn(),
  },
}))

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: vi.fn(),
  invoke,
  isTauri,
}))

vi.mock('@tauri-apps/api/window', () => ({
  cursorPosition,
  getCurrentWindow: () => appWindow,
  monitorFromPoint,
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: class MockWebviewWindow {
    static getAll() {
      return getAllWindows()
    }

    constructor(label: string, options: unknown) {
      createWebviewWindow(label, options)
    }

    once(event: string, handler: (event: { payload: unknown }) => void) {
      return selectionWindow.once(event, handler)
    }
  },
}))

vi.mock('../config', () => ({
  loadTranslationSettings: vi.fn(),
}))

describe('screenshot selection window order', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    isTauri.mockImplementation(() => true)
    appWindow.hide.mockResolvedValue(undefined)
    appWindow.show.mockResolvedValue(undefined)
    appWindow.destroy.mockResolvedValue(undefined)
    appWindow.onCloseRequested.mockResolvedValue(vi.fn())
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
    const opening = startScreenshotTranslation()

    await vi.advanceTimersByTimeAsync(120)
    await opening

    expect(appWindow.hide).toHaveBeenCalledTimes(1)
    expect(createWebviewWindow).toHaveBeenCalledTimes(1)
    expect(appWindow.show).not.toHaveBeenCalled()
  })

  it('restores the main window when screen capture fails', async () => {
    invoke.mockRejectedValueOnce(new Error('capture failed'))
    const opening = startScreenshotTranslation()
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
    const opening = startScreenshotTranslation()
    const rejection = expect(opening).rejects.toThrow('create failed')

    await vi.advanceTimersByTimeAsync(120)

    await rejection
    expect(appWindow.show).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('delete_screenshot_file', {
      imagePath: '/tmp/fanyifanyi-screen-order.png',
    })
  })

  it('destroys screenshot windows before closing the app window', async () => {
    const closeOrder: string[] = []
    let finishOverlayDestroy: (() => void) | undefined
    const selection = {
      label: 'screenshot-selection-1',
      destroy: vi.fn(async () => {
        closeOrder.push('selection')
      }),
    }
    const overlay = {
      label: 'translation-overlay-1',
      destroy: vi.fn(() => new Promise<void>((resolve) => {
        finishOverlayDestroy = () => {
          closeOrder.push('overlay')
          resolve()
        }
      })),
    }
    const unrelated = {
      label: 'settings',
      destroy: vi.fn().mockResolvedValue(undefined),
    }
    getAllWindows.mockResolvedValue([selection, overlay, unrelated])
    const unlisten = vi.fn()
    let handler: ((event: { preventDefault: () => void }) => Promise<void>) | undefined
    appWindow.onCloseRequested.mockImplementation(async (next: (event: { preventDefault: () => void }) => Promise<void>) => {
      handler = next
      return unlisten
    })
    appWindow.destroy.mockImplementation(async () => {
      closeOrder.push('main')
    })

    await expect(bindAppWindowClose()).resolves.toBe(unlisten)
    const event = { preventDefault: vi.fn() }
    const closing = handler?.(event)
    await vi.advanceTimersByTimeAsync(0)

    expect(overlay.destroy).toHaveBeenCalledTimes(1)
    expect(appWindow.destroy).not.toHaveBeenCalled()

    finishOverlayDestroy?.()
    await closing

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(selection.destroy).toHaveBeenCalledTimes(1)
    expect(unrelated.destroy).not.toHaveBeenCalled()
    expect(closeOrder).toEqual(['selection', 'overlay', 'main'])
  })

  it('does not bind close outside the app', async () => {
    isTauri.mockReturnValueOnce(false)

    const stop = await bindAppWindowClose()
    stop()

    expect(appWindow.onCloseRequested).not.toHaveBeenCalled()
  })

  it('reports a close-listener registration failure', async () => {
    const error = new Error('listen failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    appWindow.onCloseRequested.mockRejectedValueOnce(error)

    const stop = await bindAppWindowClose()
    stop()

    expect(consoleError).toHaveBeenCalledWith('无法注册截图窗口清理监听', error)
    consoleError.mockRestore()
  })
})
