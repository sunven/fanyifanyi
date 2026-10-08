import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TranslationOverlay from '../TranslationOverlay'

const { currentWindow, readTranslationOverlay, prepareTranslationOverlay, reportTranslationOverlayError } = vi.hoisted(() => ({
  currentWindow: {
    destroy: vi.fn().mockResolvedValue(undefined),
  },
  readTranslationOverlay: vi.fn(),
  prepareTranslationOverlay: vi.fn(),
  reportTranslationOverlayError: vi.fn(),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => currentWindow,
}))

vi.mock('@/lib/screenshot-translation', () => ({
  readTranslationOverlay,
  prepareTranslationOverlay,
  reportTranslationOverlayError,
}))

const overlay = {
  text: '第一行译文\n第二行译文以及 verylongunbrokenidentifier',
  original: {
    src: 'asset://localhost/screenshot.png',
    region: { x: 120, y: 80, width: 300, height: 160 },
    imageWidth: 1440,
    imageHeight: 900,
  },
}

const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts')

describe('translation overlay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    readTranslationOverlay.mockReturnValue(overlay)
    prepareTranslationOverlay.mockReset().mockResolvedValue(undefined)
    reportTranslationOverlayError.mockReset().mockResolvedValue(undefined)
    Object.defineProperty(document, 'fonts', { configurable: true, value: undefined })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    if (originalFonts) {
      Object.defineProperty(document, 'fonts', originalFonts)
    }
    else {
      Reflect.deleteProperty(document, 'fonts')
    }
  })

  it('prepares the translation without waiting for the original image', async () => {
    render(<TranslationOverlay />)

    expect(screen.getByRole('region', { name: '译文' }).textContent).toBe(overlay.text)
    expect(screen.getByRole('button', { name: '译文' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '原图' })).toBeDisabled()
    await waitFor(() => expect(prepareTranslationOverlay).toHaveBeenCalledOnce())
    expect(reportTranslationOverlayError).not.toHaveBeenCalled()
  })

  it('waits for fonts and measures the rendered content at each requested width', async () => {
    let resolveFonts!: () => void
    const fontsReady = new Promise<void>((resolve) => {
      resolveFonts = resolve
    })
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: fontsReady } })

    const measurements: number[] = []
    const heights: number[] = []
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const width = Number.parseFloat(this.style.width)
      measurements.push(width)
      return new DOMRect(0, 0, width, width === 240 ? 182.5 : 116)
    })
    prepareTranslationOverlay.mockImplementation(async (measureHeight: (width: number) => number) => {
      heights.push(measureHeight(240), measureHeight(420))
    })

    render(<TranslationOverlay />)
    expect(prepareTranslationOverlay).not.toHaveBeenCalled()

    await act(async () => resolveFonts())

    await waitFor(() => expect(prepareTranslationOverlay).toHaveBeenCalledOnce())
    expect(measurements).toEqual([240, 420])
    expect(heights).toEqual([183, 116])
  })

  it('switches between translation and the selected original region at its logical size', async () => {
    render(<TranslationOverlay />)
    const image = screen.getByRole('img', { hidden: true })

    fireEvent.load(image)
    fireEvent.click(screen.getByRole('button', { name: '原图' }))

    expect(screen.getByRole('button', { name: '原图' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('region', { name: '原图' })).toBeVisible()
    expect(screen.queryByRole('region', { name: '译文' })).not.toBeInTheDocument()
    expect(image.parentElement).toHaveStyle({ width: '300px', height: '160px' })
    expect(image.parentElement).toHaveClass('overflow-hidden')
    expect(image).toHaveStyle({ left: '-120px', top: '-80px', width: '1440px', height: '900px' })

    fireEvent.click(screen.getByRole('button', { name: '译文' }))

    expect(screen.getByRole('region', { name: '译文' })).toBeVisible()
    expect(screen.queryByRole('region', { name: '原图' })).not.toBeInTheDocument()
    await waitFor(() => expect(prepareTranslationOverlay).toHaveBeenCalledOnce())
  })

  it('restores the translation reading position after looking at the original', () => {
    render(<TranslationOverlay />)
    const translation = screen.getByRole('region', { name: '译文' })
    translation.scrollTop = 140

    fireEvent.load(screen.getByRole('img', { hidden: true }))
    fireEvent.click(screen.getByRole('button', { name: '原图' }))
    translation.scrollTop = 0
    fireEvent.click(screen.getByRole('button', { name: '译文' }))

    expect(translation.scrollTop).toBe(140)
  })

  it('keeps translation readable and explains when the original image fails', async () => {
    render(<TranslationOverlay />)

    fireEvent.error(screen.getByRole('img', { hidden: true }))

    expect(screen.getByRole('button', { name: '原图' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('原图加载失败')
    expect(within(screen.getByRole('region', { name: '译文' })).getByText(overlay.text, { normalizer: text => text })).toBeVisible()
    await waitFor(() => expect(prepareTranslationOverlay).toHaveBeenCalledOnce())
    expect(reportTranslationOverlayError).not.toHaveBeenCalled()
  })

  it('returns to the translation when an already displayed original fails', () => {
    render(<TranslationOverlay />)
    const image = screen.getByRole('img', { hidden: true })
    const translation = screen.getByRole('region', { name: '译文' })
    translation.scrollTop = 88
    fireEvent.load(image)
    fireEvent.click(screen.getByRole('button', { name: '原图' }))

    fireEvent.error(image)

    expect(screen.getByRole('region', { name: '译文' })).toBeVisible()
    expect(translation.scrollTop).toBe(88)
    expect(screen.getByRole('button', { name: '原图' })).toBeDisabled()
  })

  it('destroys the current window on Escape and removes the listener when unmounted', () => {
    const { unmount } = render(<TranslationOverlay />)

    fireEvent.keyDown(window, { key: 'Enter' })
    expect(currentWindow.destroy).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(currentWindow.destroy).toHaveBeenCalledOnce()

    unmount()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(currentWindow.destroy).toHaveBeenCalledOnce()
  })

  it('provides a focusable close button that destroys the current window', () => {
    render(<TranslationOverlay />)
    const close = screen.getByRole('button', { name: '关闭截图翻译' })

    close.focus()
    expect(close).toHaveFocus()
    fireEvent.click(close)

    expect(currentWindow.destroy).toHaveBeenCalledOnce()
  })

  it('reports missing overlay content without preparing an empty window', async () => {
    readTranslationOverlay.mockReturnValue(null)
    const { container } = render(<TranslationOverlay />)

    await waitFor(() => expect(reportTranslationOverlayError).toHaveBeenCalledWith('截图翻译内容不存在'))
    expect(prepareTranslationOverlay).not.toHaveBeenCalled()
    expect(container).toBeEmptyDOMElement()
  })

  it('reports window preparation failures to the parent', async () => {
    prepareTranslationOverlay.mockRejectedValue(new Error('无法设置窗口位置'))

    render(<TranslationOverlay />)

    await waitFor(() => expect(reportTranslationOverlayError).toHaveBeenCalledWith('无法设置窗口位置'))
  })

  it('does not prepare the window if unmounted before fonts are ready', async () => {
    let resolveFonts!: () => void
    const fontsReady = new Promise<void>((resolve) => {
      resolveFonts = resolve
    })
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: fontsReady } })
    const { unmount } = render(<TranslationOverlay />)

    unmount()
    await act(async () => resolveFonts())

    expect(prepareTranslationOverlay).not.toHaveBeenCalled()
    expect(reportTranslationOverlayError).not.toHaveBeenCalled()
  })
})
