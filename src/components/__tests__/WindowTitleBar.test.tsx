import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TitleBarSpacer, WindowTitleBar } from '../WindowTitleBar'

const originalPlatform = navigator.platform

function setPlatform(platform: string) {
  Object.defineProperty(navigator, 'platform', {
    value: platform,
    configurable: true,
  })
}

afterEach(() => {
  setPlatform(originalPlatform)
})

describe('window titlebar', () => {
  it('renders custom titlebar controls on macOS', async () => {
    setPlatform('MacIntel')

    render(
      <WindowTitleBar title="设置">
        <button type="button">返回</button>
      </WindowTitleBar>,
    )

    expect(await screen.findByTestId('window-titlebar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回' })).toBeInTheDocument()
    expect(screen.getByText('设置')).toBeInTheDocument()
  })

  it('does not add a titlebar on non-macOS platforms', () => {
    setPlatform('Win32')

    render(
      <WindowTitleBar title="设置">
        <button type="button">返回</button>
      </WindowTitleBar>,
    )

    expect(screen.queryByTestId('window-titlebar')).not.toBeInTheDocument()
  })

  it('keeps titlebar control clicks out of drag handling', () => {
    setPlatform('MacIntel')
    const handleMouseDown = vi.fn()

    render(
      <div onMouseDown={handleMouseDown}>
        <WindowTitleBar title="fanyifanyi">
          <button type="button">AI 配置</button>
        </WindowTitleBar>
      </div>,
    )

    fireEvent.mouseDown(screen.getByRole('button', { name: 'AI 配置' }))

    expect(handleMouseDown).not.toHaveBeenCalled()
  })
})

describe('titlebar spacer', () => {
  it('reserves overlay titlebar space on macOS only', async () => {
    setPlatform('MacIntel')

    const { container } = render(<TitleBarSpacer />)

    expect(container.firstElementChild).toHaveClass('h-10')
  })
})
