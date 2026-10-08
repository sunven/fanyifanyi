import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  appWindow,
  createWebviewWindow,
  emitTo,
  holdOverlay,
  invoke,
  selectionWindow,
  translate,
} = vi.hoisted(() => ({
  appWindow: {
    show: vi.fn(),
  },
  createWebviewWindow: vi.fn(),
  emitTo: vi.fn(),
  holdOverlay: {
    current: false,
    release: undefined as (() => void) | undefined,
  },
  invoke: vi.fn(),
  selectionWindow: {
    destroy: vi.fn(),
    setFocus: vi.fn(),
    show: vi.fn(),
  },
  translate: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
  invoke,
  isTauri: () => true,
}))

vi.mock('@tauri-apps/api/event', () => ({
  emitTo,
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: class MockWebviewWindow {
    static getByLabel() {
      return Promise.resolve(appWindow)
    }

    constructor(label: string, options: unknown) {
      createWebviewWindow(label, options)
    }

    once(event: string, handler: (event: { payload: unknown }) => void) {
      if (event === 'tauri://created') {
        if (holdOverlay.current) {
          holdOverlay.release = () => handler({ payload: null })
        }
        else {
          queueMicrotask(() => handler({ payload: null }))
        }
      }
      return Promise.resolve(vi.fn())
    }
  },
}))

vi.mock('@tauri-apps/api/window', () => ({
  cursorPosition: vi.fn(),
  getCurrentWindow: () => selectionWindow,
  monitorFromPoint: vi.fn(),
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
  let session: typeof import('../screenshot-translation')

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    holdOverlay.current = false
    holdOverlay.release = undefined
    emitTo.mockResolvedValue(undefined)
    invoke.mockResolvedValue('Hello')
    translate.mockResolvedValue({ text: '你好', engine: { provider: 'google' } })
    selectionWindow.show.mockResolvedValue(undefined)
    selectionWindow.setFocus.mockResolvedValue(undefined)
    selectionWindow.destroy.mockResolvedValue(undefined)
    appWindow.show.mockResolvedValue(undefined)
    showSelectionWindow()
    session = await import('../screenshot-translation')
  })

  it('shows the selection window only the image and logical size', () => {
    expect(session.selectionFrame()).toEqual({
      imageSrc: 'asset:///tmp/shot.png',
      logicalWidth: 800,
      logicalHeight: 500,
    })
  })

  it('shows the selection window, then the app window, then focuses the selection window', async () => {
    await session.revealSelectionWindow()

    expect(selectionWindow.show.mock.invocationCallOrder[0])
      .toBeLessThan(appWindow.show.mock.invocationCallOrder[0])
    expect(appWindow.show.mock.invocationCallOrder[0])
      .toBeLessThan(selectionWindow.setFocus.mock.invocationCallOrder[0])
  })

  it('lets a failed app-window show through', async () => {
    appWindow.show.mockRejectedValueOnce(new Error('restore failed'))

    await expect(session.revealSelectionWindow()).rejects.toThrow('restore failed')
    expect(selectionWindow.setFocus).not.toHaveBeenCalled()
  })

  it('turns a css rectangle into the ocr region and overlay rect', async () => {
    await session.translateSelection(selection)

    expect(invoke).toHaveBeenCalledWith('recognize_screenshot_text', {
      imagePath: '/tmp/shot.png',
      imageRegion: { x: 20, y: 40, width: 60, height: 80 },
      imageWidth: 1600,
      imageHeight: 1000,
    })
    expect(translate).toHaveBeenCalledWith('Hello', 'screenshot', undefined, undefined)
    expect(invoke).toHaveBeenCalledWith('history_record', {
      entry: expect.objectContaining({
        kind: 'screenshot',
        sourceText: 'Hello',
        translatedText: '你好',
        engine: { provider: 'google' },
      }),
    })
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
    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
  })

  it('opens an overlay for empty ocr text and still discards the capture', async () => {
    invoke.mockResolvedValueOnce('')
    translate.mockResolvedValueOnce(null)

    await session.translateSelection(selection)

    expect(translate).toHaveBeenCalledWith('', 'screenshot', undefined, undefined)
    expect(createWebviewWindow).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('delete_screenshot_file', {
      imagePath: '/tmp/shot.png',
    })
    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
  })

  it('keeps the capture and the selection window when translation fails', async () => {
    translate.mockRejectedValueOnce(new Error('翻译失败'))

    await expect(session.translateSelection(selection)).rejects.toThrow('翻译失败')
    expect(invoke).not.toHaveBeenCalledWith('delete_screenshot_file', {
      imagePath: '/tmp/shot.png',
    })
    expect(selectionWindow.destroy).not.toHaveBeenCalled()
  })

  it('allows another submit after a failure', async () => {
    translate.mockRejectedValueOnce(new Error('翻译失败'))
    await expect(session.translateSelection(selection)).rejects.toThrow('翻译失败')

    await session.translateSelection(selection)

    expect(createWebviewWindow).toHaveBeenCalledTimes(1)
    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
  })

  it('reuses recognized text when retrying the same region with another engine', async () => {
    translate.mockRejectedValueOnce(new Error('Google 不可用'))
    await expect(session.translateSelection(selection)).rejects.toThrow('Google 不可用')

    await session.translateSelection(selection, { provider: 'microsoft' })

    expect(invoke.mock.calls.filter(([command]) => command === 'recognize_screenshot_text')).toHaveLength(1)
    expect(translate).toHaveBeenLastCalledWith('Hello', 'screenshot', undefined, { provider: 'microsoft' })
    expect(invoke.mock.calls.filter(([command]) => command === 'history_record')).toHaveLength(1)
  })

  it('recognizes again when the region changes after a translation failure', async () => {
    translate.mockRejectedValueOnce(new Error('翻译失败'))
    await expect(session.translateSelection(selection)).rejects.toThrow('翻译失败')
    invoke.mockResolvedValueOnce('Different region')

    await session.translateSelection({ ...selection, x: 50 })

    const recognitions = invoke.mock.calls.filter(([command]) => command === 'recognize_screenshot_text')
    expect(recognitions).toHaveLength(2)
    expect(recognitions[1]).toEqual(['recognize_screenshot_text', {
      imagePath: '/tmp/shot.png',
      imageRegion: { x: 100, y: 40, width: 60, height: 80 },
      imageWidth: 1600,
      imageHeight: 1000,
    }])
    expect(translate).toHaveBeenLastCalledWith('Different region', 'screenshot', undefined, undefined)
    expect(invoke).toHaveBeenCalledWith('history_record', {
      entry: expect.objectContaining({ sourceText: 'Different region' }),
    })
  })

  it('retries recognition after an ocr failure without discarding the selection', async () => {
    invoke.mockRejectedValueOnce(new Error('OCR failed'))

    await expect(session.translateSelection(selection)).rejects.toThrow('OCR failed')

    expect(translate).not.toHaveBeenCalled()
    expect(createWebviewWindow).not.toHaveBeenCalled()
    expect(selectionWindow.destroy).not.toHaveBeenCalled()
    expect(invoke.mock.calls.map(([command]) => command)).toEqual(['recognize_screenshot_text'])

    await session.translateSelection(selection)

    expect(invoke.mock.calls.filter(([command]) => command === 'recognize_screenshot_text')).toHaveLength(2)
    expect(translate).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls.filter(([command]) => command === 'history_record')).toHaveLength(1)
    expect(createWebviewWindow).toHaveBeenCalledTimes(1)
    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
  })

  it('ignores duplicate submissions while recognition and translation are pending', async () => {
    let finishTranslation: (() => void) | undefined
    translate.mockImplementationOnce(() => new Promise((resolve) => {
      finishTranslation = () => resolve({ text: '你好', engine: { provider: 'google' } })
    }))

    const pending = session.translateSelection(selection)
    await session.translateSelection(selection)
    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(1))
    await session.translateSelection(selection)
    finishTranslation?.()
    await pending
    await session.translateSelection(selection)

    expect(invoke.mock.calls.filter(([command]) => command === 'recognize_screenshot_text')).toHaveLength(1)
    expect(translate).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls.filter(([command]) => command === 'history_record')).toHaveLength(1)
    expect(createWebviewWindow).toHaveBeenCalledTimes(1)
    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
  })

  it('keeps a successful overlay and closes the selection when saving history fails', async () => {
    invoke.mockImplementation((command: string) => {
      if (command === 'recognize_screenshot_text')
        return Promise.resolve('Hello')
      if (command === 'history_record')
        return Promise.reject(new Error('disk full'))
      return Promise.resolve()
    })

    await expect(session.translateSelection(selection)).resolves.toBeUndefined()

    expect(createWebviewWindow).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls.filter(([command]) => command === 'history_record')).toHaveLength(1)
    expect(emitTo).toHaveBeenCalledWith('main', 'history-save-failed', expect.any(String))
    expect(invoke).toHaveBeenCalledWith('delete_screenshot_file', { imagePath: '/tmp/shot.png' })
    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
    const label = createWebviewWindow.mock.calls[0][0]
    window.history.replaceState({}, '', `/?window=translation-overlay&label=${label}`)
    expect(session.takeOverlayText()).toBe('你好')
  })

  it('voids a submit that has not opened the overlay', async () => {
    let finishRecognize: (value: string) => void = () => {}
    invoke.mockImplementation((command: string) => {
      if (command === 'recognize_screenshot_text') {
        return new Promise<string>((resolve) => {
          finishRecognize = resolve
        })
      }
      return Promise.resolve()
    })

    const pending = session.translateSelection(selection)
    await session.cancelSelection()
    finishRecognize('Hello')
    await pending

    expect(createWebviewWindow).not.toHaveBeenCalled()
    expect(translate).not.toHaveBeenCalled()
    expect(invoke).toHaveBeenCalledWith('delete_screenshot_file', {
      imagePath: '/tmp/shot.png',
    })
    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
  })

  it('does not open an overlay or save history when cancelled while awaiting translation', async () => {
    let finishTranslation: (() => void) | undefined
    translate.mockImplementationOnce(() => new Promise((resolve) => {
      finishTranslation = () => resolve({ text: '你好', engine: { provider: 'google' } })
    }))

    const pending = session.translateSelection(selection)
    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(1))
    await session.cancelSelection()
    finishTranslation?.()
    await pending

    expect(createWebviewWindow).not.toHaveBeenCalled()
    expect(invoke.mock.calls.filter(([command]) => command === 'history_record')).toHaveLength(0)
    expect(invoke.mock.calls.filter(([command]) => command === 'delete_screenshot_file')).toHaveLength(1)
    expect(emitTo).not.toHaveBeenCalled()
    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
  })

  it('does not roll back an overlay once opening has started', async () => {
    holdOverlay.current = true
    const pending = session.translateSelection(selection)

    await vi.waitFor(() => expect(createWebviewWindow).toHaveBeenCalledTimes(1))
    await session.cancelSelection()
    holdOverlay.release?.()
    await pending

    expect(createWebviewWindow).toHaveBeenCalledTimes(1)
    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
    const deletes = invoke.mock.calls.filter(([command]) => command === 'delete_screenshot_file')
    expect(deletes).toHaveLength(1)
  })

  it('discards the capture from the current window and ignores a repeated discard', async () => {
    await session.discardSelection()
    await session.discardSelection()

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

    expect(session.takeOverlayText()).toBe('你好')
    expect(session.takeOverlayText()).toBeNull()
    expect(localStorage.getItem('translation-overlay:test-overlay')).toBeNull()
  })
})
