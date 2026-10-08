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

  it('retries unchanged text after failure and saves only the accepted result', async () => {
    invoke.mockRejectedValueOnce('请求过于频繁，请稍后重试')
    render(<TranslateDisplay q="hello" />)
    await finishDebounce()

    expect(screen.getByRole('alert')).toHaveTextContent('请求过于频繁')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^重试$/,
      }))
    })

    expect(screen.getByText('你好')).toBeInTheDocument()
    expect(invoke.mock.calls.filter(([command]) => command === 'history_record')).toHaveLength(1)
  })

  it('uses a fallback once and restores the default engine for new text', async () => {
    invoke.mockRejectedValueOnce('Google 不可用')
    const { rerender } = render(<TranslateDisplay q="hello" />)
    await finishDebounce()
    const option = screen.getByRole('option', { name: 'Microsoft 翻译' })
    fireEvent.change(screen.getByLabelText('备用翻译引擎'), { target: { value: option.getAttribute('value') } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '使用此引擎重试',
      }))
    })
    expect(invoke).toHaveBeenCalledWith('translate_with_microsoft', { text: 'hello', targetLanguage: 'zh-CN' })
    expect(screen.getByText('Microsoft 翻译')).toBeInTheDocument()

    rerender(<TranslateDisplay q="goodbye" />)
    await finishDebounce()
    expect(invoke).toHaveBeenCalledWith('translate_with_google', { text: 'goodbye', targetLanguage: 'zh-CN' })
    const entries = invoke.mock.calls.filter(([command]) => command === 'history_record').map(([, args]) => args.entry)
    expect(entries.map(entry => entry.engine.provider)).toEqual(['microsoft', 'google'])
  })

  it('ignores an old response during the debounce for new input', async () => {
    let finish: (value: string) => void = () => {}
    invoke.mockReturnValueOnce(new Promise<string>((resolve) => {
      finish = resolve
    }))
    const { rerender } = render(<TranslateDisplay q="old" />)
    await finishDebounce()
    rerender(<TranslateDisplay q="new" />)
    await act(async () => {
      finish('旧译文')
    })
    expect(screen.queryByText('旧译文')).not.toBeInTheDocument()
    expect(invoke.mock.calls.filter(([command]) => command === 'history_record')).toHaveLength(0)
    await finishDebounce()
    expect(screen.getByText('你好')).toBeInTheDocument()
  })

  it('does not display or save a response after stopping', async () => {
    let finish: (value: string) => void = () => {}
    invoke.mockReturnValueOnce(new Promise<string>((resolve) => {
      finish = resolve
    }))
    render(<TranslateDisplay q="hello" />)
    await finishDebounce()
    fireEvent.click(screen.getByTitle('停止翻译'))
    await act(async () => {
      finish('已取消的译文')
    })
    expect(screen.queryByText('已取消的译文')).not.toBeInTheDocument()
    expect(invoke.mock.calls.filter(([command]) => command === 'history_record')).toHaveLength(0)
  })

  it('keeps the successful translation when history storage fails', async () => {
    invoke.mockImplementation(command => command === 'history_record' ? Promise.reject(new Error('磁盘已满')) : Promise.resolve('你好'))
    render(<TranslateDisplay q="hello" />)
    await finishDebounce()
    expect(screen.getByText('你好')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('未能保存到本地历史')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
