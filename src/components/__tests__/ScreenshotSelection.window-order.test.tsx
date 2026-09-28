import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

const { translateSelection } = vi.hoisted(() => ({
  translateSelection: vi.fn(),
}))

vi.mock('@/lib/screenshot-translation', () => ({
  discardSelection: vi.fn(() => Promise.resolve()),
  selectionFrame: () => ({
    imageSrc: 'asset://screenshot.png',
    logicalWidth: 800,
    logicalHeight: 500,
  }),
  translateSelection,
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

  it('shows a loading state while screenshot translation is still running', async () => {
    let finishTranslation: () => void = () => {}
    translateSelection.mockImplementation(() => new Promise<void>((resolve) => {
      finishTranslation = resolve
    }))

    render(<ScreenshotSelection />)
    const surface = document.querySelector('.cursor-crosshair')
    expect(surface).not.toBeNull()

    fireEvent.mouseDown(surface!, { clientX: 20, clientY: 30 })
    fireEvent.mouseMove(surface!, { clientX: 140, clientY: 120 })
    fireEvent.mouseUp(surface!)
    fireEvent.click(screen.getByRole('button', { name: '翻译' }))

    expect(await screen.findByRole('status')).toHaveTextContent('正在识别并翻译')
    await waitFor(() => expect(translateSelection).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('status')).toBeInTheDocument()

    finishTranslation()
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })
})
