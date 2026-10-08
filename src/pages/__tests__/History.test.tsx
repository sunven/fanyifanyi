import type { HistorySnapshot, TranslationRecord } from '@/lib/history'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import History from '../History'

const { loadHistory, setHistoryFavorite, deleteHistoryEntry, writeText, isTauri, listen } = vi.hoisted(() => ({
  loadHistory: vi.fn(),
  setHistoryFavorite: vi.fn(),
  deleteHistoryEntry: vi.fn(),
  writeText: vi.fn(),
  isTauri: vi.fn(),
  listen: vi.fn(),
}))

vi.mock('@/lib/history', () => ({ loadHistory, setHistoryFavorite, deleteHistoryEntry }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri }))
vi.mock('@tauri-apps/api/event', () => ({ listen }))

const records: TranslationRecord[] = [
  { id: 'new', completedAt: 1_730_000_000_000, kind: 'desk', sourceText: 'Hello world', translatedText: '你好世界', engine: { provider: 'google' }, favorite: false },
  { id: 'favorite', completedAt: 1_720_000_000_000, kind: 'screenshot', sourceText: 'Saved screen', translatedText: '珍藏截图', engine: { provider: 'ai', modelName: 'My model' }, favorite: true },
]

function snapshot(entries = records): HistorySnapshot {
  return { enabled: true, entries }
}

describe('translation history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadHistory.mockResolvedValue(snapshot())
    writeText.mockResolvedValue(undefined)
    isTauri.mockReturnValue(false)
    listen.mockResolvedValue(vi.fn())
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Win32' })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  })

  it('shows the newest record, selects details, and returns to the workspace', async () => {
    const onBack = vi.fn()
    render(<History onBack={onBack} />)

    const list = await screen.findByRole('navigation', { name: '翻译记录' })
    expect(within(list).getAllByRole('button')[0]).toHaveAttribute('aria-current', 'true')
    expect(within(screen.getByRole('region', { name: '翻译详情' })).getByText('Google 翻译')).toBeInTheDocument()
    fireEvent.click(within(list).getByRole('button', { name: /Saved screen/ }))
    expect(within(screen.getByRole('region', { name: '翻译详情' })).getByText('My model')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('searches original and translated text and combines search with favorites', async () => {
    render(<History onBack={vi.fn()} />)
    const list = await screen.findByRole('navigation', { name: '翻译记录' })
    const search = screen.getByRole('textbox', { name: '搜索翻译历史' })

    fireEvent.change(search, { target: { value: 'HELLO' } })
    expect(within(list).getAllByRole('button')).toHaveLength(1)
    expect(within(list).getByText('Hello world')).toBeInTheDocument()
    fireEvent.change(search, { target: { value: '珍藏' } })
    expect(within(list).getByText('Saved screen')).toBeInTheDocument()
    fireEvent.change(search, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '收藏' }))
    expect(within(list).getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '取消收藏' })).toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'hello' } })
    expect(screen.getByText('没有匹配的翻译记录')).toBeInTheDocument()
  })

  it('copies original and translated text separately', async () => {
    render(<History onBack={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '复制原文' }))
    expect(await screen.findByRole('status')).toHaveTextContent('原文已复制')
    expect(writeText).toHaveBeenLastCalledWith('Hello world')
    fireEvent.click(screen.getByRole('button', { name: '复制译文' }))
    expect(await screen.findByRole('status')).toHaveTextContent('译文已复制')
    expect(writeText).toHaveBeenLastCalledWith('你好世界')
  })

  it('updates favorites only after saving and uses the returned snapshot', async () => {
    let resolveSave!: (value: HistorySnapshot) => void
    setHistoryFavorite.mockReturnValue(new Promise<HistorySnapshot>((resolve) => {
      resolveSave = resolve
    }))
    render(<History onBack={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: '收藏此条' }))
    expect(setHistoryFavorite).toHaveBeenCalledWith('new', true)
    expect(screen.getByRole('button', { name: '收藏此条' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '取消收藏' })).not.toBeInTheDocument()
    resolveSave(snapshot(records.map(record => ({ ...record, favorite: true }))))
    expect(await screen.findByRole('button', { name: '取消收藏' })).toBeEnabled()
  })

  it('removes a record only after deletion succeeds', async () => {
    deleteHistoryEntry.mockRejectedValueOnce(new Error('disk full'))
    render(<History onBack={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '删除记录' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('删除记录失败')
    expect(within(screen.getByRole('navigation', { name: '翻译记录' })).getAllByRole('button')).toHaveLength(2)
    deleteHistoryEntry.mockResolvedValueOnce(snapshot([records[1]]))
    fireEvent.click(screen.getByRole('button', { name: '删除记录' }))
    await waitFor(() => expect(screen.queryByText('Hello world')).not.toBeInTheDocument())
    expect(deleteHistoryEntry).toHaveBeenCalledWith('new')
    expect(screen.getByRole('button', { name: '取消收藏' })).toBeInTheDocument()
  })

  it('retains the favorite state when saving fails', async () => {
    setHistoryFavorite.mockRejectedValueOnce(new Error('write failed'))
    render(<History onBack={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '收藏此条' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('保存收藏失败')
    expect(screen.getByRole('button', { name: '收藏此条' })).toBeEnabled()
  })

  it('reports a read failure and allows retry', async () => {
    loadHistory.mockRejectedValueOnce(new Error('unavailable'))
    render(<History onBack={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('读取翻译历史失败')
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
    expect(await screen.findByRole('navigation', { name: '翻译记录' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reports clipboard failures without claiming that text was copied', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'))
    render(<History onBack={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '复制原文' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('复制失败')
    expect(screen.queryByText('原文已复制')).not.toBeInTheDocument()
  })

  it('refreshes desktop history events while retaining filters and the selected record', async () => {
    isTauri.mockReturnValue(true)
    const unlisten = vi.fn()
    listen.mockResolvedValueOnce(unlisten)
    const { unmount } = render(<History onBack={vi.fn()} />)
    const list = await screen.findByRole('navigation', { name: '翻译记录' })
    fireEvent.click(screen.getByRole('button', { name: '收藏' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'screen' } })
    loadHistory.mockResolvedValueOnce(snapshot([
      { ...records[1], id: 'fresh', completedAt: 1_740_000_000_000, sourceText: 'Fresh screen' },
      ...records,
    ]))

    expect(listen).toHaveBeenCalledWith('translation-history-changed', expect.any(Function))
    await act(async () => {
      listen.mock.calls[0][1]({ payload: null })
    })

    expect(within(list).getByText('Fresh screen')).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: /Saved screen/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('textbox')).toHaveValue('screen')
    expect(screen.getByRole('button', { name: '收藏' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(list).queryByText('Hello world')).not.toBeInTheDocument()
    unmount()
    expect(unlisten).toHaveBeenCalledOnce()
    listen.mock.calls[0][1]({ payload: null })
    expect(loadHistory).toHaveBeenCalledTimes(2)
  })

  it('discards a reload that arrives after a newer favorite was saved', async () => {
    isTauri.mockReturnValue(true)
    render(<History onBack={vi.fn()} />)
    await screen.findByRole('button', { name: '收藏此条' })
    let resolveReload!: (value: HistorySnapshot) => void
    loadHistory.mockReturnValueOnce(new Promise<HistorySnapshot>((resolve) => {
      resolveReload = resolve
    }))
    act(() => {
      listen.mock.calls[0][1]({ payload: null })
    })
    setHistoryFavorite.mockResolvedValueOnce(snapshot(records.map(record => ({ ...record, favorite: true }))))
    fireEvent.click(screen.getByRole('button', { name: '收藏此条' }))
    expect(await screen.findByRole('button', { name: '取消收藏' })).toBeEnabled()

    await act(async () => {
      resolveReload(snapshot())
    })
    expect(screen.getByRole('button', { name: '取消收藏' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '收藏此条' })).not.toBeInTheDocument()
  })

  it('defers events received during a write until the mutation completes', async () => {
    isTauri.mockReturnValue(true)
    let resolveSave!: (value: HistorySnapshot) => void
    setHistoryFavorite.mockReturnValueOnce(new Promise<HistorySnapshot>((resolve) => {
      resolveSave = resolve
    }))
    render(<History onBack={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '收藏此条' }))
    const favorites = records.map(record => ({ ...record, favorite: true }))
    loadHistory.mockResolvedValueOnce(snapshot([{ ...records[0], id: 'fresh', sourceText: 'New screenshot' }, ...favorites]))
    act(() => {
      listen.mock.calls[0][1]({ payload: null })
    })
    expect(loadHistory).toHaveBeenCalledOnce()

    await act(async () => {
      resolveSave(snapshot(favorites))
    })
    expect(loadHistory).toHaveBeenCalledTimes(2)
    expect(screen.getByText('New screenshot')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消收藏' })).toBeEnabled()
  })

  it('disposes a listener whose registration finishes after unmount', async () => {
    isTauri.mockReturnValue(true)
    let resolveListener!: (stop: () => void) => void
    const unlisten = vi.fn()
    listen.mockReturnValueOnce(new Promise<() => void>((resolve) => {
      resolveListener = resolve
    }))
    const { unmount } = render(<History onBack={vi.fn()} />)
    await screen.findByRole('navigation', { name: '翻译记录' })
    unmount()
    await act(async () => {
      resolveListener(unlisten)
    })
    expect(unlisten).toHaveBeenCalledOnce()
  })

  it('does not subscribe to native events in browser previews', async () => {
    render(<History onBack={vi.fn()} />)
    await screen.findByRole('navigation', { name: '翻译记录' })
    expect(loadHistory).toHaveBeenCalledOnce()
    expect(listen).not.toHaveBeenCalled()
  })
})
