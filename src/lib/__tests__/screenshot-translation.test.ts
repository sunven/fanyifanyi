import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  appWindow,
  createWebviewWindow,
  emitTo,
  holdOverlay,
  invoke,
  listen,
  overlayWindow,
  overlayReady,
  selectionWindow,
  translate,
  unlistenReady,
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
  listen: vi.fn(),
  overlayWindow: {
    destroy: vi.fn(),
    setFocus: vi.fn(),
    show: vi.fn(),
  },
  overlayReady: {
    held: false,
    error: '',
    present: true,
    handler: undefined as ((event: { payload: { label: string, error?: string } }) => void) | undefined,
  },
  selectionWindow: {
    label: 'screenshot-selection-test',
    hide: vi.fn(),
    destroy: vi.fn(),
    setFocus: vi.fn(),
    show: vi.fn(),
  },
  translate: vi.fn(),
  unlistenReady: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
  invoke,
  isTauri: () => true,
}))

vi.mock('@tauri-apps/api/event', () => ({
  emitTo,
  listen,
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: class MockWebviewWindow {
    static getByLabel(label: string) {
      return Promise.resolve(label === 'main' ? appWindow : overlayReady.present ? overlayWindow : null)
    }

    constructor(readonly label: string, options: unknown) {
      createWebviewWindow(label, options)
    }

    destroy = overlayWindow.destroy
    show = overlayWindow.show
    setFocus = overlayWindow.setFocus

    once(event: string, handler: (event: { payload: unknown }) => void) {
      if (event === 'tauri://created') {
        const complete = () => {
          handler({ payload: null })
          if (!overlayReady.held)
            overlayReady.handler?.({ payload: { label: this.label, error: overlayReady.error || undefined } })
        }
        if (holdOverlay.current) {
          holdOverlay.release = complete
        }
        else {
          queueMicrotask(complete)
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
    workAreaX: '100',
    workAreaY: '200',
    workAreaWidth: '800',
    workAreaHeight: '500',
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
    overlayReady.held = false
    overlayReady.error = ''
    overlayReady.present = true
    overlayReady.handler = undefined
    createWebviewWindow.mockReset()
    overlayWindow.destroy.mockResolvedValue(undefined)
    overlayWindow.show.mockResolvedValue(undefined)
    overlayWindow.setFocus.mockResolvedValue(undefined)
    listen.mockImplementation(async (_event, handler) => {
      overlayReady.handler = handler
      return unlistenReady
    })
    emitTo.mockResolvedValue(undefined)
    invoke.mockImplementation(async (command: string) => {
      if (command === 'recognize_screenshot_text')
        return 'Hello'
      if (command === 'transfer_screenshot_file')
        return true
    })
    translate.mockResolvedValue({ text: '你好', engine: { provider: 'google' } })
    selectionWindow.hide.mockResolvedValue(undefined)
    selectionWindow.show.mockResolvedValue(undefined)
    selectionWindow.setFocus.mockResolvedValue(undefined)
    selectionWindow.destroy.mockResolvedValue(undefined)
    appWindow.show.mockResolvedValue(undefined)
    showSelectionWindow()
    session = await import('../screenshot-translation')
  })

  afterEach(() => {
    vi.useRealTimers()
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
    expect(translate).toHaveBeenCalledWith('Hello', 'screenshot', expect.any(AbortSignal), undefined)
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
        visible: false,
      }),
    )
    expect(invoke).toHaveBeenCalledWith('delete_screenshot_file', {
      imagePath: '/tmp/shot.png',
    })
    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('transfer_screenshot_file', {
      imagePath: '/tmp/shot.png',
      targetWindowLabel: createWebviewWindow.mock.calls[0][0],
    })
    expect(listen.mock.invocationCallOrder[0]).toBeLessThan(createWebviewWindow.mock.invocationCallOrder[0])
    expect(overlayWindow.show.mock.invocationCallOrder[0]).toBeLessThan(selectionWindow.destroy.mock.invocationCallOrder[0])
    expect(unlistenReady).toHaveBeenCalledTimes(1)
  })

  it('opens an overlay for empty ocr text and still discards the capture', async () => {
    invoke.mockResolvedValueOnce('')
    translate.mockResolvedValueOnce(null)

    await session.translateSelection(selection)

    expect(translate).toHaveBeenCalledWith('', 'screenshot', expect.any(AbortSignal), undefined)
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
    expect(translate).toHaveBeenLastCalledWith('Hello', 'screenshot', expect.any(AbortSignal), { provider: 'microsoft' })
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
    expect(translate).toHaveBeenLastCalledWith('Different region', 'screenshot', expect.any(AbortSignal), undefined)
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
      if (command === 'transfer_screenshot_file')
        return Promise.resolve(true)
      return Promise.resolve()
    })

    await expect(session.translateSelection(selection)).resolves.toBeUndefined()

    expect(createWebviewWindow).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls.filter(([command]) => command === 'history_record')).toHaveLength(1)
    expect(emitTo).toHaveBeenCalledWith('main', 'history-save-failed', expect.any(String))
    expect(invoke).toHaveBeenCalledWith('delete_screenshot_file', { imagePath: '/tmp/shot.png' })
    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
    const label = createWebviewWindow.mock.calls[0][0]
    expect(localStorage.getItem(`translation-overlay:${label}`)).toBeNull()
    expect(overlayWindow.destroy).not.toHaveBeenCalled()
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
    const requestSignal = translate.mock.calls[0][2] as AbortSignal
    expect(requestSignal.aborted).toBe(false)
    await session.cancelSelection()
    expect(requestSignal.aborted).toBe(true)
    finishTranslation?.()
    await pending

    expect(createWebviewWindow).not.toHaveBeenCalled()
    expect(invoke.mock.calls.filter(([command]) => command === 'history_record')).toHaveLength(0)
    expect(invoke.mock.calls.filter(([command]) => command === 'delete_screenshot_file')).toHaveLength(1)
    expect(emitTo).not.toHaveBeenCalled()
    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
  })

  it('cancels a hidden overlay before native creation completes', async () => {
    holdOverlay.current = true
    const pending = session.translateSelection(selection)

    await vi.waitFor(() => expect(createWebviewWindow).toHaveBeenCalledTimes(1))
    const cancellation = session.cancelSelection()
    await vi.waitFor(() => expect(selectionWindow.hide).toHaveBeenCalledTimes(1))
    expect(selectionWindow.destroy).not.toHaveBeenCalled()
    holdOverlay.release?.()
    await cancellation
    await pending
    await Promise.resolve()

    expect(overlayWindow.show).not.toHaveBeenCalled()
    expect(overlayWindow.destroy).toHaveBeenCalledTimes(1)
    expect(unlistenReady).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls.filter(([command]) => command === 'history_record')).toHaveLength(0)
    const label = createWebviewWindow.mock.calls[0][0]
    expect(localStorage.getItem(`translation-overlay:${label}`)).toBeNull()

    expect(createWebviewWindow).toHaveBeenCalledTimes(1)
    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
    const deletes = invoke.mock.calls.filter(([command]) => command === 'delete_screenshot_file')
    expect(deletes).toHaveLength(1)
  })

  it('reports OCR, provider translation, and overlay preparation separately', async () => {
    const progress = vi.fn()

    await session.translateSelection(selection, undefined, progress)

    expect(progress.mock.calls).toEqual([['recognizing'], ['translating'], ['opening']])
    expect(progress.mock.invocationCallOrder[0]).toBeLessThan(invoke.mock.invocationCallOrder[0])
    expect(progress.mock.invocationCallOrder[1]).toBeLessThan(translate.mock.invocationCallOrder[0])
    expect(progress.mock.invocationCallOrder[2]).toBeLessThan(createWebviewWindow.mock.invocationCallOrder[0])
  })

  it('skips the OCR phase when a retry reuses recognized text', async () => {
    translate.mockRejectedValueOnce(new Error('provider failed'))
    await expect(session.translateSelection(selection)).rejects.toThrow('provider failed')
    const progress = vi.fn()

    await session.translateSelection(selection, { provider: 'microsoft' }, progress)

    expect(progress.mock.calls).toEqual([['translating'], ['opening']])
  })

  it('settles cancellation without waiting for OCR or screenshot file deletion', async () => {
    invoke.mockImplementation((command: string) => {
      if (command === 'recognize_screenshot_text' || command === 'delete_screenshot_file')
        return new Promise(() => {})
      return Promise.resolve()
    })
    const progress = vi.fn()
    const pending = session.translateSelection(selection, undefined, progress)

    await session.cancelSelection()
    await pending

    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
    expect(progress.mock.calls).toEqual([['recognizing']])
    expect(translate).not.toHaveBeenCalled()
  })

  it('settles cancellation without waiting for a provider response', async () => {
    translate.mockImplementationOnce(() => new Promise(() => {}))
    const pending = session.translateSelection(selection)
    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(1))

    await session.cancelSelection()
    await pending

    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
    expect(createWebviewWindow).not.toHaveBeenCalled()
  })

  it('cancels an overlay waiting for layout without waiting for the ready timeout', async () => {
    overlayReady.held = true
    const pending = session.translateSelection(selection)
    await vi.waitFor(() => expect(createWebviewWindow).toHaveBeenCalledTimes(1))
    const label = createWebviewWindow.mock.calls[0][0]

    await session.cancelSelection()
    await pending
    overlayReady.handler?.({ payload: { label } })
    await Promise.resolve()

    expect(overlayWindow.show).not.toHaveBeenCalled()
    expect(overlayWindow.destroy).toHaveBeenCalledTimes(1)
    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
    expect(unlistenReady).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(`translation-overlay:${label}`)).toBeNull()
    expect(invoke.mock.calls.filter(([command]) => command === 'history_record')).toHaveLength(0)
  })

  it('finishes cancellation when hidden overlay cleanup completes before the parent hide response', async () => {
    let finishHide: () => void = () => {}
    selectionWindow.hide.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishHide = resolve
    }))
    overlayReady.held = true
    const pending = session.translateSelection(selection)
    await vi.waitFor(() => expect(createWebviewWindow).toHaveBeenCalledTimes(1))

    const cancellation = session.cancelSelection()
    await pending
    expect(overlayWindow.destroy).toHaveBeenCalledTimes(1)
    finishHide()
    await cancellation

    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
    expect(overlayWindow.show).not.toHaveBeenCalled()
  })

  it('preserves an already displayed overlay while ownership transfer is pending', async () => {
    let finishTransfer: (value: boolean) => void = () => {}
    invoke.mockImplementation((command: string) => {
      if (command === 'recognize_screenshot_text')
        return Promise.resolve('Hello')
      if (command === 'transfer_screenshot_file') {
        return new Promise<boolean>((resolve) => {
          finishTransfer = resolve
        })
      }
      return Promise.resolve()
    })
    const pending = session.translateSelection(selection)
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('transfer_screenshot_file', expect.anything()))

    await session.cancelSelection()
    expect(selectionWindow.destroy).not.toHaveBeenCalled()
    expect(overlayWindow.destroy).not.toHaveBeenCalled()
    finishTransfer(true)
    await pending

    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
    expect(overlayWindow.destroy).not.toHaveBeenCalled()
    expect(invoke.mock.calls.filter(([command]) => command === 'history_record')).toHaveLength(1)
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

  it('waits for layout before showing the overlay or transferring the screenshot', async () => {
    overlayReady.held = true
    const pending = session.translateSelection(selection)
    await vi.waitFor(() => expect(createWebviewWindow).toHaveBeenCalledTimes(1))
    const label = createWebviewWindow.mock.calls[0][0]
    const payload = JSON.parse(localStorage.getItem(`translation-overlay:${label}`)!)

    expect(payload.original).toEqual({
      imagePath: '/tmp/shot.png',
      region: selection,
      imageWidth: 800,
      imageHeight: 500,
    })
    expect(payload.workArea).toEqual({ x: 100, y: 200, width: 800, height: 500 })
    expect(overlayWindow.show).not.toHaveBeenCalled()
    expect(invoke.mock.calls.filter(([command]) => command === 'transfer_screenshot_file')).toHaveLength(0)

    overlayReady.handler?.({ payload: { label: 'some-other-overlay' } })
    expect(overlayWindow.show).not.toHaveBeenCalled()
    overlayReady.handler?.({ payload: { label } })
    await pending

    expect(overlayWindow.show).toHaveBeenCalledTimes(1)
    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
  })

  it('keeps the selection for retry after an overlay initialization failure', async () => {
    overlayReady.error = 'layout failed'

    await expect(session.translateSelection(selection)).rejects.toThrow('layout failed')

    expect(overlayWindow.destroy).toHaveBeenCalledTimes(1)
    expect(selectionWindow.destroy).not.toHaveBeenCalled()
    expect(invoke.mock.calls.filter(([command]) => command === 'delete_screenshot_file')).toHaveLength(0)
    const label = createWebviewWindow.mock.calls[0][0]
    expect(localStorage.getItem(`translation-overlay:${label}`)).toBeNull()
    overlayReady.error = ''
    await session.translateSelection(selection)
    expect(invoke.mock.calls.filter(([command]) => command === 'recognize_screenshot_text')).toHaveLength(1)
    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
  })

  it('cleans an overlay that never becomes ready without discarding its source', async () => {
    vi.useFakeTimers()
    overlayReady.held = true
    const pending = session.translateSelection(selection)
    const failure = expect(pending).rejects.toThrow('初始化超时')
    await vi.waitFor(() => expect(createWebviewWindow).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(10_000)
    await failure

    expect(overlayWindow.destroy).toHaveBeenCalledTimes(1)
    expect(unlistenReady).toHaveBeenCalledTimes(1)
    expect(selectionWindow.destroy).not.toHaveBeenCalled()
    expect(invoke.mock.calls.filter(([command]) => command === 'delete_screenshot_file')).toHaveLength(0)
  })

  it('can retry after a synchronous overlay constructor failure', async () => {
    createWebviewWindow.mockImplementationOnce(() => {
      throw new Error('create failed')
    })

    await expect(session.translateSelection(selection)).rejects.toThrow('create failed')
    expect(localStorage.getItem(`translation-overlay:${createWebviewWindow.mock.calls[0][0]}`)).toBeNull()
    expect(selectionWindow.destroy).not.toHaveBeenCalled()
    await session.translateSelection(selection)

    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls.filter(([command]) => command === 'recognize_screenshot_text')).toHaveLength(1)
  })

  it('preserves the capture when ownership transfer fails', async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'recognize_screenshot_text')
        return 'Hello'
      if (command === 'transfer_screenshot_file')
        throw new Error('transfer failed')
    })

    await expect(session.translateSelection(selection)).rejects.toThrow('transfer failed')

    expect(overlayWindow.destroy).toHaveBeenCalledTimes(1)
    expect(selectionWindow.destroy).not.toHaveBeenCalled()
    expect(invoke.mock.calls.filter(([command]) => command === 'delete_screenshot_file')).toHaveLength(0)
    expect(invoke.mock.calls.filter(([command]) => command === 'history_record')).toHaveLength(0)
  })

  it('finishes if the displayed overlay is closed before ownership transfer', async () => {
    invoke.mockImplementation(async (command: string) => command === 'recognize_screenshot_text' ? 'Hello' : false)

    await session.translateSelection(selection)

    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('delete_screenshot_file', { imagePath: '/tmp/shot.png' })
    expect(createWebviewWindow).toHaveBeenCalledTimes(1)
  })

  it('does not submit again when closing the selection fails after handoff', async () => {
    selectionWindow.destroy.mockRejectedValueOnce(new Error('close failed'))

    await expect(session.translateSelection(selection)).rejects.toThrow('close failed')
    await session.translateSelection(selection)

    expect(createWebviewWindow).toHaveBeenCalledTimes(1)
    expect(translate).toHaveBeenCalledTimes(1)
    expect(overlayWindow.destroy).not.toHaveBeenCalled()
  })
})
