import type { ReactNode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Home from '../Home'

const { translate, updateState } = vi.hoisted(() => {
  const updateState = {
    hasUpdate: false,
    updateInfo: null,
    updateHandle: null,
    isChecking: false,
    isDownloading: false,
    error: null,
    isDismissed: false,
    isDevMode: false,
    checkUpdate: vi.fn(),
    dismissUpdate: vi.fn(),
    resetDismiss: vi.fn(),
    downloadAndInstall: vi.fn(),
    retryDownload: vi.fn(),
    clearError: vi.fn(),
  }

  return {
    translate: vi.fn(),
    updateState,
  }
})

vi.mock('@/lib/translate', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/translate')>(),
  translate,
}))

vi.mock('@/components/CopyText', () => ({
  default: () => <button type="button">复制</button>,
}))

vi.mock('@/components/dictionary-display', () => ({
  default: () => <div>词典结果</div>,
}))

vi.mock('@/components/WindowTitleBar', () => ({
  WindowTitleBar: ({ children, center }: { children?: ReactNode, center?: ReactNode }) => (
    <div>
      {center}
      {children}
    </div>
  ),
  TitleBarSpacer: () => null,
  NonMacOnly: () => null,
}))

vi.mock('../Settings', () => ({
  default: ({ onBack }: { onBack: () => void }) => (
    <div>
      <h1>设置</h1>
      <button type="button" onClick={onBack}>返回</button>
    </div>
  ),
}))

vi.mock('../History', () => ({
  default: ({ onBack }: { onBack: () => void }) => (
    <div>
      <h1>历史</h1>
      <button type="button" onClick={onBack}>返回</button>
    </div>
  ),
}))

vi.mock('streamdown', () => ({
  Streamdown: ({ children }: { children: string }) => <div>{children}</div>,
}))

vi.mock('@/contexts/UpdateContext', () => {
  const updateContextModule = {
    getCurrentVersion: () => Promise.resolve('0.1.30'),
  }
  Object.defineProperty(updateContextModule, 'useUpdate', {
    enumerable: true,
    value: () => updateState,
  })
  return updateContextModule
})

describe('home navigation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    translate.mockResolvedValue({ text: 'translated text', engine: { provider: 'google' } })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it.each(['设置', '历史'])('preserves the input and result after returning from %s', async (page) => {
    render(<Home />)

    fireEvent.change(screen.getByPlaceholderText('输入要翻译的文本...'), {
      target: { value: 'hello' },
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(translate).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: page }))
    expect(screen.getByRole('heading', { name: page })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '返回' }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    expect(screen.getByPlaceholderText('输入要翻译的文本...')).toHaveValue('hello')
    expect(screen.getByText('translated text')).toBeVisible()
    expect(translate).toHaveBeenCalledTimes(1)
  })

  it('does not ask the system for inline writing suggestions while typing', () => {
    render(<Home />)

    const source = screen.getByPlaceholderText('输入要翻译的文本...')
    expect(source).toHaveAttribute('spellcheck', 'false')
    expect(source).toHaveAttribute('autocorrect', 'off')
    expect(source).toHaveAttribute('autocapitalize', 'off')
    expect(source).toHaveAttribute('autocomplete', 'off')
    expect(source).toHaveAttribute('writingsuggestions', 'false')
  })
})
