import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ClipboardTranslation from '../ClipboardTranslation'

const { invoke, listen, unlisten, display } = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
  display: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen }))
vi.mock('@/components/translate-display', () => ({
  default: (props: { q: string }) => {
    display(props)
    return (
      <div>
        正在翻译：
        {props.q}
      </div>
    )
  },
}))

let change: (event: { payload: number }) => void
let current = { id: 1, sourceText: 'Hello', error: null as string | null }

describe('clipboard translation popup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    current = { id: 1, sourceText: 'Hello', error: null }
    listen.mockImplementation(async (_event, handler) => {
      change = handler
      return unlisten
    })
    invoke.mockImplementation(async command => command === 'get_clipboard_translation_session' ? current : undefined)
  })

  it('subscribes before reading and translates immediately with a collapsed source', async () => {
    render(<ClipboardTranslation />)
    expect(await screen.findByText('正在翻译：Hello')).toBeInTheDocument()
    expect(listen.mock.invocationCallOrder[0]).toBeLessThan(invoke.mock.invocationCallOrder[0])
    expect(display).toHaveBeenCalledWith({ q: 'Hello', startDelay: 0, clipboardSessionId: 1 })
    expect(screen.getByText('查看原文').closest('details')).not.toHaveAttribute('open')
  })

  it('does not reload the same session and replaces old content on a new event', async () => {
    render(<ClipboardTranslation />)
    await screen.findByText('正在翻译：Hello')
    const reads = invoke.mock.calls.length
    await act(async () => change({ payload: 1 }))
    expect(invoke).toHaveBeenCalledTimes(reads)

    current = { id: 2, sourceText: 'Goodbye', error: null }
    await act(async () => change({ payload: 2 }))
    expect(screen.getByText('正在翻译：Goodbye')).toBeInTheDocument()
    expect(screen.queryByText('正在翻译：Hello')).not.toBeInTheDocument()
  })

  it('displays clipboard errors without mounting a translation request', async () => {
    current = { id: 1, sourceText: '', error: '剪贴板没有可翻译的文字，请复制文字后再试' }
    render(<ClipboardTranslation />)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('剪贴板没有可翻译的文字'))
    expect(display).not.toHaveBeenCalled()
  })

  it('unmounts the translation immediately when Escape closes the session', async () => {
    render(<ClipboardTranslation />)
    await screen.findByText('正在翻译：Hello')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('正在翻译：Hello')).not.toBeInTheDocument()
    expect(invoke).toHaveBeenCalledWith('close_clipboard_translation', { restoreFocus: true, id: 1 })
  })

  it('can close using the button and retries closing after a native failure', async () => {
    render(<ClipboardTranslation />)
    await screen.findByText('正在翻译：Hello')
    invoke.mockRejectedValueOnce(new Error('window busy'))
    fireEvent.click(screen.getByRole('button', { name: '关闭快捷翻译' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('关闭快捷翻译失败')
    fireEvent.click(screen.getByRole('button', { name: '关闭快捷翻译' }))
    await waitFor(() => expect(invoke.mock.calls.filter(([command]) => command === 'close_clipboard_translation')).toHaveLength(2))
  })

  it('ignores a stale initial read after a newer session arrives', async () => {
    let finish: (value: typeof current) => void = () => {}
    invoke.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    render(<ClipboardTranslation />)
    await waitFor(() => expect(invoke).toHaveBeenCalledOnce())
    current = { id: 2, sourceText: 'Newest', error: null }
    await act(async () => change({ payload: 2 }))
    await act(async () => finish({ id: 1, sourceText: 'Old', error: null }))
    expect(screen.getByText('正在翻译：Newest')).toBeInTheDocument()
    expect(screen.queryByText('正在翻译：Old')).not.toBeInTheDocument()
  })

  it('releases the event listener even if registration finishes after unmount', async () => {
    let finish: (stop: () => void) => void = () => {}
    listen.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    const view = render(<ClipboardTranslation />)
    view.unmount()
    await act(async () => finish(unlisten))
    expect(unlisten).toHaveBeenCalledOnce()
    expect(invoke).not.toHaveBeenCalled()
  })
})
