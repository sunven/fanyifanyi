import { beforeEach, describe, expect, it, vi } from 'vitest'

const { currentWindow, emitTo } = vi.hoisted(() => ({
  currentWindow: {
    label: 'translation-overlay-test',
    setSize: vi.fn(),
    setPosition: vi.fn(),
  },
  emitTo: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
  invoke: vi.fn(),
  isTauri: () => true,
}))

vi.mock('@tauri-apps/api/event', () => ({ emitTo, listen: vi.fn() }))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => currentWindow,
  cursorPosition: vi.fn(),
  monitorFromPoint: vi.fn(),
}))
vi.mock('@tauri-apps/api/webviewWindow', () => ({ WebviewWindow: vi.fn() }))

function overlayPayload(overrides = {}) {
  const payload = {
    x: 130,
    y: 230,
    width: 420,
    height: 160,
    text: '第一行译文\n第二行译文',
    workArea: { x: 100, y: 200, width: 800, height: 500 },
    selectionWindowLabel: 'screenshot-selection-test',
    original: {
      imagePath: '/tmp/fanyifanyi-screen-test.png',
      region: { x: 30, y: 30, width: 420, height: 160 },
      imageWidth: 800,
      imageHeight: 500,
    },
    ...overrides,
  }
  localStorage.setItem('translation-overlay:translation-overlay-test', JSON.stringify(payload))
  return payload
}

describe('translation overlay initialization', () => {
  let session: typeof import('../screenshot-translation')

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorage.clear()
    window.history.replaceState({}, '', '/?window=translation-overlay&label=translation-overlay-test')
    currentWindow.setSize.mockResolvedValue(undefined)
    currentWindow.setPosition.mockResolvedValue(undefined)
    emitTo.mockResolvedValue(undefined)
    session = await import('../screenshot-translation')
  })

  it('consumes the handoff once while retaining render data for repeated initialization', () => {
    const payload = overlayPayload()

    const data = session.readTranslationOverlay()

    expect(data).toEqual({
      text: payload.text,
      original: {
        src: 'asset:///tmp/fanyifanyi-screen-test.png',
        region: payload.original.region,
        imageWidth: 800,
        imageHeight: 500,
      },
    })
    expect(localStorage.getItem('translation-overlay:translation-overlay-test')).toBeNull()
    expect(session.readTranslationOverlay()).toEqual(data)
  })

  it('keeps a readable translation in the original selection bounds', async () => {
    overlayPayload()
    const measure = vi.fn(() => 120)

    await session.prepareTranslationOverlay(measure)

    expect(measure).toHaveBeenCalledWith(420)
    expect(currentWindow.setSize).toHaveBeenCalledWith(expect.objectContaining({ width: 420, height: 160 }))
    expect(currentWindow.setPosition).toHaveBeenCalledWith(expect.objectContaining({ x: 130, y: 230 }))
    expect(emitTo).toHaveBeenCalledWith('screenshot-selection-test', 'translation-overlay-ready', {
      label: 'translation-overlay-test',
    })
    expect(currentWindow.setPosition.mock.invocationCallOrder[0]).toBeLessThan(emitTo.mock.invocationCallOrder[0])
  })

  it('expands a small selection using measured content at the reading width', async () => {
    overlayPayload({ width: 30, height: 40 })
    const measure = vi.fn((width: number) => width < 240 ? 1800 : 220)

    await session.prepareTranslationOverlay(measure)

    expect(measure).toHaveBeenCalledWith(420)
    expect(currentWindow.setSize).toHaveBeenCalledWith(expect.objectContaining({ width: 420, height: 220 }))
  })

  it('caps long content and moves an edge selection inside its monitor work area', async () => {
    overlayPayload({ x: 870, y: 670, width: 100, height: 40 })

    await session.prepareTranslationOverlay(() => 2400)

    expect(currentWindow.setSize).toHaveBeenCalledWith(expect.objectContaining({ width: 420, height: 476 }))
    expect(currentWindow.setPosition).toHaveBeenCalledWith(expect.objectContaining({ x: 468, y: 212 }))
  })

  it('keeps an expanded overlay on a monitor with a negative desktop origin', async () => {
    overlayPayload({
      x: -70,
      y: 760,
      width: 800,
      height: 100,
      workArea: { x: -1280, y: 24, width: 1280, height: 740 },
    })

    await session.prepareTranslationOverlay(() => 1500)

    expect(currentWindow.setSize).toHaveBeenCalledWith(expect.objectContaining({ width: 640, height: 560 }))
    expect(currentWindow.setPosition).toHaveBeenCalledWith(expect.objectContaining({ x: -652, y: 192 }))
  })

  it('reports initialization failures to the selection instead of announcing readiness', async () => {
    overlayPayload()
    currentWindow.setSize.mockRejectedValueOnce(new Error('resize failed'))

    await expect(session.prepareTranslationOverlay(() => 120)).rejects.toThrow('resize failed')
    expect(emitTo).not.toHaveBeenCalled()

    await session.reportTranslationOverlayError('resize failed')

    expect(emitTo).toHaveBeenCalledWith('screenshot-selection-test', 'translation-overlay-ready', {
      label: 'translation-overlay-test',
      error: 'resize failed',
    })
  })
})
