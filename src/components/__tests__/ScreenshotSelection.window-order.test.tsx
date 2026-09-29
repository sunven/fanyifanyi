import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ScreenshotSelection from '../ScreenshotSelection'

const { cancelSelection, revealSelectionWindow, translateSelection } = vi.hoisted(() => ({
  cancelSelection: vi.fn(() => Promise.resolve()),
  revealSelectionWindow: vi.fn(() => Promise.resolve()),
  translateSelection: vi.fn(),
}))

vi.mock('@/lib/screenshot-translation', () => ({
  cancelSelection,
  discardSelection: vi.fn(() => Promise.resolve()),
  revealSelectionWindow,
  selectionFrame: () => ({
    imageSrc: 'asset://screenshot.png',
    logicalWidth: 800,
    logicalHeight: 500,
  }),
  translateSelection,
}))

describe('screenshot selection surface', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    revealSelectionWindow.mockResolvedValue(undefined)
    cancelSelection.mockResolvedValue(undefined)
  })

  it('paints a reported reveal failure', async () => {
    revealSelectionWindow.mockRejectedValueOnce(new Error('restore failed'))

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

  it('cancels from the escape key', async () => {
    render(<ScreenshotSelection />)

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(cancelSelection).toHaveBeenCalledTimes(1))
  })
})
