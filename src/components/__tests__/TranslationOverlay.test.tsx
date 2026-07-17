import { render } from '@testing-library/react'
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
      width: 300,
      height: 120,
      text: 'A long translation should remain clipped to the captured region.',
    }))
  })

  it('keeps the captured region size without showing scrollbars', () => {
    const { container } = render(<TranslationOverlay />)
    const overlay = container.firstElementChild

    expect(overlay).toHaveClass('h-screen', 'w-screen', 'overflow-hidden')
    expect(overlay).not.toHaveClass('overflow-auto')
  })
})
