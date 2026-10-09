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
let current = { id: 1, sourceText: 'Hello', error: null as string | null, permissionRequired: false }

describe('clipboard translation popup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    current = { id: 1, sourceText: 'Hello', error: null, permissionRequired: false }
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

    current = { id: 2, sourceText: 'Goodbye', error: null, permissionRequired: false }
    await act(async () => change({ payload: 2 }))
    expect(screen.getByText('正在翻译：Goodbye')).toBeInTheDocument()
    expect(screen.queryByText('正在翻译：Hello')).not.toBeInTheDocument()
  })

  it('displays clipboard errors without mounting a translation request', async () => {
    current = { id: 1, sourceText: '', error: '剪贴板没有可翻译的文字，请复制文字后再试', permissionRequired: false }
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

  it('guides accessibility authorization without starting a translation', async () => {
    current = { id: 1, sourceText: '', error: '请授权辅助功能后返回网页重新选中文字', permissionRequired: true }
    render(<ClipboardTranslation />)
    fireEvent.click(await screen.findByRole('button', { name: '打开辅助功能设置' }))
    expect(invoke).toHaveBeenCalledWith('open_selection_accessibility_settings')
    expect(display).not.toHaveBeenCalled()
  })

  it('provides manual authorization directions if opening system settings fails', async () => {
    current = { id: 1, sourceText: '', error: '需要辅助功能权限', permissionRequired: true }
    render(<ClipboardTranslation />)
    await screen.findByRole('button', { name: '打开辅助功能设置' })
    invoke.mockRejectedValueOnce(new Error('launch failed'))
    fireEvent.click(screen.getByRole('button', { name: '打开辅助功能设置' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('隐私与安全性 → 辅助功能')
    expect(display).not.toHaveBeenCalled()
  })

  it('clears a selection permission error when a successful session replaces it', async () => {
    current = { id: 1, sourceText: '', error: '需要辅助功能权限', permissionRequired: true }
    render(<ClipboardTranslation />)
    await screen.findByRole('button', { name: '打开辅助功能设置' })
    current = { id: 2, sourceText: 'Selected sentence', error: null, permissionRequired: false }
    await act(async () => change({ payload: 2 }))
    expect(screen.queryByRole('button', { name: '打开辅助功能设置' })).not.toBeInTheDocument()
    expect(screen.getByText('正在翻译：Selected sentence')).toBeInTheDocument()
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

  it('keeps translation cancelled when destruction fails after native session invalidation', async () => {
    render(<ClipboardTranslation />)
    await screen.findByText('正在翻译：Hello')
    display.mockClear()
    invoke.mockImplementation(async (command) => {
      if (command === 'get_clipboard_translation_session')
        return null
      throw new Error('window busy')
    })

    fireEvent.click(screen.getByRole('button', { name: '关闭快捷翻译' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('关闭快捷翻译失败')
    expect(screen.queryByText('正在翻译：Hello')).not.toBeInTheDocument()
    expect(display).not.toHaveBeenCalled()

    invoke.mockResolvedValueOnce(undefined)
    fireEvent.click(screen.getByRole('button', { name: '关闭快捷翻译' }))
    await waitFor(() => expect(invoke.mock.calls.filter(([command]) => command === 'close_clipboard_translation')).toHaveLength(2))
    expect(display).not.toHaveBeenCalled()
  })

  it('ignores a stale initial read after a newer session arrives', async () => {
    let finish: (value: typeof current) => void = () => {}
    invoke.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    render(<ClipboardTranslation />)
    await waitFor(() => expect(invoke).toHaveBeenCalledOnce())
    current = { id: 2, sourceText: 'Newest', error: null, permissionRequired: false }
    await act(async () => change({ payload: 2 }))
    await act(async () => finish({ id: 1, sourceText: 'Old', error: null, permissionRequired: false }))
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
