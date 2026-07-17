import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TranslationOverlay from '../TranslationOverlay'

const { currentWindow } = vi.hoisted(() => ({
  currentWindow: {
    destroy: vi.fn(),
  },
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => currentWindow,
}))

describe('translation overlay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/?window=translation-overlay&label=test-overlay')
    localStorage.setItem('translation-overlay:test-overlay', JSON.stringify({
      x: 10,
      y: 20,
      width: 18,
      height: 18,
      text: 'A long translation should remain clipped to the captured region.',
    }))
  })

  it('keeps the captured region size without showing scrollbars', () => {
    const { container } = render(<TranslationOverlay />)
    const overlay = container.firstElementChild

    expect(overlay).toHaveClass('h-screen', 'w-screen', 'overflow-hidden')
    expect(overlay).not.toHaveClass('overflow-auto')
  })

  it('uses compact spacing so short captured regions do not clip content', () => {
    const { container } = render(<TranslationOverlay />)
    const overlay = container.firstElementChild
    const closeButton = screen.getByRole('button', { name: '关闭截图翻译' })
    const text = screen.getByText('A long translation should remain clipped to the captured region.')

    expect(overlay).toHaveClass('p-0.5', 'text-xs', 'leading-3')
    expect(overlay).not.toHaveClass('px-3', 'py-2', 'text-sm', 'leading-6')
    expect(closeButton).toHaveClass('right-0.5', 'top-0.5', 'h-3', 'w-3')
    expect(text).toHaveClass('pr-3')
  })
})
