import type { ReactNode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Home from '../Home'

const { translateStream, updateState } = vi.hoisted(() => {
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
    translateStream: vi.fn(),
    updateState,
  }
})

vi.mock('@/lib/ai', () => ({
  translateStream,
}))

vi.mock('@/components/CopyText', () => ({
  default: () => <button type="button">复制</button>,
}))

vi.mock('@/components/dictionary-display', () => ({
  default: () => <div>词典结果</div>,
}))

vi.mock('@/components/WindowTitleBar', () => ({
  WindowTitleBar: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TitleBarSpacer: () => null,
}))

vi.mock('../Settings', () => ({
  default: ({ onBack }: { onBack: () => void }) => (
    <div>
      <h1>设置</h1>
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

describe('home settings navigation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    translateStream.mockImplementation(async function* () {
      yield 'translated text'
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('does not translate the same text again after returning from settings', async () => {
    render(<Home />)

    fireEvent.change(screen.getByPlaceholderText('输入要翻译的文本...'), {
      target: { value: 'hello' },
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(translateStream).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /AI 配置/ }))
    expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '返回' }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    expect(screen.getByPlaceholderText('输入要翻译的文本...')).toHaveValue('hello')
    expect(translateStream).toHaveBeenCalledTimes(1)
  })
})
