import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

    expect(await screen.findByRole('status')).toHaveTextContent('正在识别文字')
    await waitFor(() => expect(translateSelection).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('status')).toBeInTheDocument()

    finishTranslation()
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('keeps cancellation accessible during recognition and translation', async () => {
    let updateStage: (stage: 'recognizing' | 'translating' | 'opening') => void = () => {}
    let finish: () => void = () => {}
    translateSelection.mockImplementation((_selection, _target, onProgress) => {
      updateStage = onProgress
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    })
    drawSelection()
    fireEvent.click(screen.getByRole('button', { name: '翻译' }))
    await waitFor(() => expect(translateSelection).toHaveBeenCalledOnce())
    expect(screen.getByRole('status')).toHaveTextContent('正在识别文字')
    expect(screen.queryByRole('button', { name: '翻译' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(cancelSelection).toHaveBeenCalledOnce()

    act(() => updateStage('translating'))
    expect(screen.getByRole('status')).toHaveTextContent('正在翻译')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(cancelSelection).toHaveBeenCalledTimes(2)
    act(() => updateStage('opening'))
    expect(screen.getByRole('status')).toHaveTextContent('正在打开译文')
    expect(screen.getByRole('button', { name: '取消' })).toBeEnabled()
    await act(async () => finish())
  })

  function drawSelection() {
    render(<ScreenshotSelection />)
    const surface = document.querySelector('.cursor-crosshair')!
    fireEvent.mouseDown(surface, { button: 0, clientX: 100, clientY: 100 })
    fireEvent.mouseMove(window, { clientX: 300, clientY: 200 })
    fireEvent.mouseUp(window)
    return { surface, selection: screen.getByRole('region', { name: '截图选区' }) }
  }

  it('moves the selection inside screen bounds and submits the updated rectangle', async () => {
    translateSelection.mockResolvedValue(undefined)
    const { selection } = drawSelection()
    fireEvent.mouseDown(selection, { button: 0, clientX: 150, clientY: 130 })
    fireEvent.mouseMove(window, { clientX: 950, clientY: 650 })
    fireEvent.mouseUp(window)

    expect(selection).toHaveStyle({ left: '600px', top: '400px', width: '200px', height: '100px' })
    fireEvent.mouseMove(window, { clientX: 0, clientY: 0 })
    fireEvent.mouseDown(screen.getByRole('button', { name: '翻译' }))
    fireEvent.click(screen.getByRole('button', { name: '翻译' }))
    await waitFor(() => expect(translateSelection).toHaveBeenCalledWith(
      { x: 600, y: 400, width: 200, height: 100 },
      undefined,
      expect.any(Function),
    ))
  })

  it.each([
    ['上边', 200, 100, 200, 80, 100, 80, 200, 120],
    ['下边', 200, 200, 200, 240, 100, 100, 200, 140],
    ['左边', 100, 150, 60, 150, 60, 100, 240, 100],
    ['右边', 300, 150, 340, 150, 100, 100, 240, 100],
    ['左上角', 100, 100, 60, 80, 60, 80, 240, 120],
    ['右上角', 300, 100, 340, 80, 100, 80, 240, 120],
    ['左下角', 100, 200, 60, 240, 60, 100, 240, 140],
    ['右下角', 300, 200, 340, 240, 100, 100, 240, 140],
  ])('resizes from %s while keeping the opposite edges fixed', (edge, startX, startY, endX, endY, x, y, width, height) => {
    const { selection } = drawSelection()
    fireEvent.mouseDown(screen.getByTitle(`调整选区${edge}`), { button: 0, clientX: startX, clientY: startY })
    fireEvent.mouseMove(window, { clientX: endX, clientY: endY })
    fireEvent.mouseUp(window)

    expect(selection).toHaveStyle({ left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` })
  })

  it('limits resizing to the screen and prevents the rectangle from collapsing', () => {
    const { selection } = drawSelection()
    fireEvent.mouseDown(screen.getByTitle('调整选区左上角'), { button: 0, clientX: 100, clientY: 100 })
    fireEvent.mouseMove(window, { clientX: -100, clientY: -100 })
    expect(selection).toHaveStyle({ left: '0px', top: '0px', width: '300px', height: '200px' })
    fireEvent.mouseMove(window, { clientX: 500, clientY: 500 })
    expect(selection).toHaveStyle({ left: '292px', top: '192px', width: '8px', height: '8px' })
    fireEvent.blur(window)
    fireEvent.mouseMove(window, { clientX: 100, clientY: 100 })
    expect(selection).toHaveStyle({ width: '8px', height: '8px' })
  })

  it('allows drawing a new selection outside the current rectangle and ignores right clicks', () => {
    const { surface, selection } = drawSelection()
    fireEvent.mouseDown(selection, { button: 2, clientX: 150, clientY: 130 })
    fireEvent.mouseMove(window, { clientX: 400, clientY: 300 })
    expect(selection).toHaveStyle({ left: '100px', top: '100px' })
    fireEvent.mouseDown(surface, { button: 0, clientX: 500, clientY: 300 })
    fireEvent.mouseMove(window, { clientX: 900, clientY: 700 })
    fireEvent.mouseUp(window)
    expect(selection).toHaveStyle({ left: '500px', top: '300px', width: '300px', height: '200px' })
  })

  it('cancels from the escape key', async () => {
    render(<ScreenshotSelection />)

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(cancelSelection).toHaveBeenCalledTimes(1))
  })
})
