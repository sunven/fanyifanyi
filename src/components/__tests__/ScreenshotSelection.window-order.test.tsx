import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ScreenshotSelection from '../ScreenshotSelection'

const { appWindow, selectionWindow } = vi.hoisted(() => ({
  appWindow: {
    show: vi.fn(),
  },
  selectionWindow: {
    destroy: vi.fn(),
    setFocus: vi.fn(),
    show: vi.fn(),
  },
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => selectionWindow,
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: {
    getByLabel: vi.fn(() => Promise.resolve(appWindow)),
  },
}))

vi.mock('@/lib/screenshot-translation', () => ({
  deleteScreenshotFile: vi.fn(() => Promise.resolve()),
  logicalOverlayRect: vi.fn(),
  openTranslationOverlay: vi.fn(),
  physicalSelection: vi.fn(),
  readSelectionWindowParams: () => ({
    imagePath: '/tmp/fanyifanyi-screen-order.png',
    screenX: 0,
    screenY: 0,
    screenWidth: 1600,
    screenHeight: 1000,
    scaleFactor: 2,
    logicalX: 0,
    logicalY: 0,
    logicalWidth: 800,
    logicalHeight: 500,
  }),
  recognizeScreenshotText: vi.fn(),
  screenshotImageSrc: () => 'asset://screenshot.png',
  translateScreenshotText: vi.fn(),
}))

describe('screenshot selection window display order', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appWindow.show.mockResolvedValue(undefined)
    selectionWindow.show.mockResolvedValue(undefined)
    selectionWindow.setFocus.mockResolvedValue(undefined)
  })

  it('restores the main window behind the visible selection window', async () => {
    render(<ScreenshotSelection />)

    await waitFor(() => expect(appWindow.show).toHaveBeenCalledTimes(1))

    expect(selectionWindow.show.mock.invocationCallOrder[0])
      .toBeLessThan(appWindow.show.mock.invocationCallOrder[0])
    expect(appWindow.show.mock.invocationCallOrder[0])
      .toBeLessThan(selectionWindow.setFocus.mock.invocationCallOrder[0])
  })

  it('shows an error when the main window cannot be restored', async () => {
    appWindow.show.mockRejectedValueOnce(new Error('restore failed'))

    render(<ScreenshotSelection />)

    expect(await screen.findByText('restore failed')).toBeInTheDocument()
  })
})
