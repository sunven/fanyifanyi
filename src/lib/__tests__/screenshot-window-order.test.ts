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
    unminimize: vi.fn(),
    setFocus: vi.fn(),
  },
  createWebviewWindow: vi.fn(),
  cursorPosition: vi.fn(),
  getAllWindows: vi.fn(),
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
  monitorFromPoint: vi.fn(),
  selectionWindow: {
    once: vi.fn(),
    destroy: vi.fn(),
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

    destroy = selectionWindow.destroy

    once(event: string, handler: (event: { payload: unknown }) => void) {
      return selectionWindow.once(event, handler)
    }
  },
}))

vi.mock('../translate', () => ({
  translate: vi.fn(),
}))

describe('screenshot selection window order', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    createWebviewWindow.mockReset()
    isTauri.mockImplementation(() => true)
    appWindow.hide.mockResolvedValue(undefined)
    appWindow.show.mockResolvedValue(undefined)
    appWindow.unminimize.mockResolvedValue(undefined)
    appWindow.setFocus.mockResolvedValue(undefined)
    getAllWindows.mockResolvedValue([])
    appWindow.destroy.mockResolvedValue(undefined)
    appWindow.onCloseRequested.mockResolvedValue(vi.fn())
    selectionWindow.destroy.mockResolvedValue(undefined)
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
    invoke.mockImplementation(async (command: string) => command === 'capture_screen_region'
      ? { imagePath: '/tmp/fanyifanyi-screen-order.png', workArea: { x: 0, y: 24, width: 800, height: 450 } }
      : true)
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

  it('captures only once when the shortcut is repeated during preparation', async () => {
    let finishCapture: (() => void) | undefined
    invoke.mockImplementationOnce(() => new Promise((resolve) => {
      finishCapture = () => resolve({
        imagePath: '/tmp/fanyifanyi-screen-order.png',
        workArea: { x: 0, y: 24, width: 800, height: 450 },
      })
    }))

    const opening = startScreenshotTranslation()
    await startScreenshotTranslation()
    await vi.advanceTimersByTimeAsync(120)
    await startScreenshotTranslation()
    finishCapture?.()
    await opening

    expect(getAllWindows).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls.filter(([command]) => command === 'capture_screen_region')).toHaveLength(1)
    expect(createWebviewWindow).toHaveBeenCalledTimes(1)
    expect(appWindow.hide).toHaveBeenCalledTimes(1)
  })

  it('focuses an existing selection window without taking another screenshot', async () => {
    const existing = {
      label: 'screenshot-selection-existing',
      setFocus: vi.fn().mockResolvedValue(undefined),
    }
    getAllWindows.mockResolvedValue([
      { label: 'main' },
      { label: 'translation-overlay-existing' },
      existing,
    ])

    await startScreenshotTranslation()

    expect(existing.setFocus).toHaveBeenCalledTimes(1)
    expect(cursorPosition).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
    expect(createWebviewWindow).not.toHaveBeenCalled()
    expect(appWindow.hide).not.toHaveBeenCalled()
  })

  it('restores the main window after a capture failure and allows another startup', async () => {
    invoke.mockRejectedValueOnce(new Error('capture failed'))
    const opening = startScreenshotTranslation()
    const rejection = expect(opening).rejects.toThrow('capture failed')

    await vi.advanceTimersByTimeAsync(120)

    await rejection
    expect(appWindow.show).toHaveBeenCalledTimes(1)

    const retry = startScreenshotTranslation()
    await vi.advanceTimersByTimeAsync(120)
    await retry

    expect(invoke.mock.calls.filter(([command]) => command === 'capture_screen_region')).toHaveLength(2)
    expect(createWebviewWindow).toHaveBeenCalledTimes(1)
  })

  it('restores the main window after a creation failure and allows another startup', async () => {
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

    selectionWindow.once.mockImplementation((event, handler) => {
      if (event === 'tauri://created') {
        queueMicrotask(() => handler({ payload: null }))
      }
      return Promise.resolve(vi.fn())
    })
    const retry = startScreenshotTranslation()
    await vi.advanceTimersByTimeAsync(120)
    await retry

    expect(invoke.mock.calls.filter(([command]) => command === 'capture_screen_region')).toHaveLength(2)
    expect(createWebviewWindow).toHaveBeenCalledTimes(2)
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
    localStorage.setItem('translation-overlay:translation-overlay-1', 'pending payload')
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
    expect(localStorage.getItem('translation-overlay:translation-overlay-1')).toBeNull()
  })

  it('cleans the capture and restores main after a synchronous creation failure', async () => {
    createWebviewWindow.mockImplementationOnce(() => {
      throw new Error('create failed')
    })
    const opening = startScreenshotTranslation()
    const failure = expect(opening).rejects.toThrow('create failed')

    await vi.advanceTimersByTimeAsync(120)
    await failure

    expect(invoke).toHaveBeenCalledWith('delete_screenshot_file', { imagePath: '/tmp/fanyifanyi-screen-order.png' })
    expect(appWindow.show).toHaveBeenCalledTimes(1)
  })

  it('releases the main-owned capture when the selection closes before handoff', async () => {
    invoke.mockImplementation(async (command: string) => command === 'capture_screen_region'
      ? { imagePath: '/tmp/fanyifanyi-screen-order.png', workArea: { x: 0, y: 24, width: 800, height: 450 } }
      : false)
    const opening = startScreenshotTranslation()

    await vi.advanceTimersByTimeAsync(120)
    await opening

    expect(invoke).toHaveBeenCalledWith('delete_screenshot_file', { imagePath: '/tmp/fanyifanyi-screen-order.png' })
    expect(appWindow.show).toHaveBeenCalledTimes(1)
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
