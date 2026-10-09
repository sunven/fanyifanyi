import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TranslateDisplay from '../translate-display'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('streamdown', () => ({ Streamdown: ({ children }: { children: string }) => <div>{children}</div> }))

async function finishDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
}

describe('desk translation recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    invoke.mockReset()
    invoke.mockImplementation((command) => {
      if (command.startsWith('translate_with_'))
        return Promise.resolve('你好')
      return Promise.resolve()
    })
  })
  afterEach(() => vi.useRealTimers())

  it('shows the engine failure and retries unchanged text', async () => {
    invoke.mockRejectedValueOnce('请求过于频繁，请稍后重试')
    render(<TranslateDisplay q="hello" />)
    await finishDebounce()

    expect(screen.getByRole('alert')).toHaveTextContent('请求过于频繁')
    expect(screen.getByRole('alert')).toHaveTextContent('Google 翻译')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^重试$/,
      }))
    })

    expect(screen.getByText('你好')).toBeInTheDocument()
  })

  it('retries with the selected fallback and displays its engine', async () => {
    invoke.mockRejectedValueOnce('Google 不可用')
    render(<TranslateDisplay q="hello" />)
    await finishDebounce()
    const option = screen.getByRole('option', { name: 'Microsoft 翻译' })
    fireEvent.change(screen.getByLabelText('备用翻译引擎'), { target: { value: option.getAttribute('value') } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '使用此引擎重试',
      }))
    })
    expect(invoke).toHaveBeenCalledWith('translate_with_microsoft', { text: 'hello', targetLanguage: 'zh-CN' })
    expect(screen.getByText('Microsoft 翻译')).toBeInTheDocument()
  })

  it('stops loading and withholds late text when the stop button is clicked', async () => {
    let finish: (value: string) => void = () => {}
    invoke.mockReturnValueOnce(new Promise<string>((resolve) => {
      finish = resolve
    }))
    render(<TranslateDisplay q="hello" />)
    await finishDebounce()
    fireEvent.click(screen.getByTitle('停止翻译'))
    expect(screen.queryByTitle('停止翻译')).not.toBeInTheDocument()
    await act(async () => {
      finish('已取消的译文')
    })
    expect(screen.queryByText('已取消的译文')).not.toBeInTheDocument()
  })

  it('keeps the successful translation when history storage fails', async () => {
    invoke.mockImplementation(command => command === 'history_record' ? Promise.reject(new Error('磁盘已满')) : Promise.resolve('你好'))
    render(<TranslateDisplay q="hello" />)
    await finishDebounce()
    expect(screen.getByText('你好')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('未能保存到本地历史')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('starts clipboard translation immediately and focuses the translation region', async () => {
    invoke.mockImplementation(command => Promise.resolve(command === 'is_clipboard_translation_current' ? true : command.startsWith('translate_with_') ? '你好' : undefined))
    render(<TranslateDisplay q="hello" startDelay={0} clipboardSessionId={7} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByText('你好')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '译文' })).toHaveFocus()
  })
})
