import type { HistorySnapshot } from '@/lib/history'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HistorySettings from '../HistorySettings'

const { loadHistory, setHistoryEnabled, clearHistory } = vi.hoisted(() => ({
  loadHistory: vi.fn(),
  setHistoryEnabled: vi.fn(),
  clearHistory: vi.fn(),
}))

vi.mock('@/lib/history', () => ({ loadHistory, setHistoryEnabled, clearHistory }))

const saved: HistorySnapshot = {
  enabled: true,
  entries: [
    { id: 'ordinary', completedAt: 1, kind: 'desk', sourceText: 'ordinary', translatedText: '普通', engine: { provider: 'google' }, favorite: false },
    { id: 'favorite', completedAt: 2, kind: 'desk', sourceText: 'favorite', translatedText: '收藏', engine: { provider: 'google' }, favorite: true },
  ],
}

describe('history settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadHistory.mockResolvedValue(saved)
    setHistoryEnabled.mockResolvedValue({ ...saved, enabled: false })
    clearHistory.mockResolvedValue({ ...saved, entries: [saved.entries[1]] })
  })

  it('disables automatic saving without clearing existing history', async () => {
    render(<HistorySettings />)
    const toggle = screen.getByRole('switch', { name: '自动保存翻译历史' })
    await waitFor(() => expect(toggle).toBeEnabled())
    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).not.toBeChecked())
    expect(setHistoryEnabled).toHaveBeenCalledWith(false)
    expect(clearHistory).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '清空普通历史' })).toBeEnabled()
    expect(screen.getByText('普通记录保留 30 天，最多 500 条；收藏长期保留。')).toBeInTheDocument()
  })

  it('keeps the saved toggle value when persistence fails', async () => {
    setHistoryEnabled.mockRejectedValueOnce(new Error('write failed'))
    render(<HistorySettings />)
    const toggle = screen.getByRole('switch')
    await waitFor(() => expect(toggle).toBeEnabled())
    fireEvent.click(toggle)
    expect(await screen.findByRole('alert')).toHaveTextContent('保存历史设置失败')
    expect(toggle).toBeChecked()
  })

  it('requires confirmation to clear ordinary records and preserves favorites', async () => {
    render(<HistorySettings />)
    const clear = screen.getByRole('button', { name: '清空普通历史' })
    await waitFor(() => expect(clear).toBeEnabled())
    fireEvent.click(clear)
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('将删除所有未收藏的翻译记录，收藏会保留。此操作无法撤销。')).toBeInTheDocument()
    expect(clearHistory).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(clearHistory).not.toHaveBeenCalled()
    fireEvent.click(clear)
    fireEvent.click(screen.getByRole('button', { name: '确认清空' }))
    expect(await screen.findByRole('status')).toHaveTextContent('普通历史已清空，收藏已保留')
    expect(clearHistory).toHaveBeenCalledOnce()
    expect(clear).toBeDisabled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('keeps the clear confirmation open when clearing fails', async () => {
    clearHistory.mockRejectedValueOnce(new Error('write failed'))
    render(<HistorySettings />)
    const clear = screen.getByRole('button', { name: '清空普通历史' })
    await waitFor(() => expect(clear).toBeEnabled())
    fireEvent.click(clear)
    fireEvent.click(screen.getByRole('button', { name: '确认清空' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('保存历史设置失败')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认清空' })).toBeEnabled()
  })

  it('does not offer writes when history settings cannot be read', async () => {
    loadHistory.mockRejectedValueOnce(new Error('read failed'))
    render(<HistorySettings />)
    expect(await screen.findByRole('alert')).toHaveTextContent('读取历史设置失败')
    expect(screen.getByRole('switch')).toBeDisabled()
    expect(screen.getByRole('button', { name: '清空普通历史' })).toBeDisabled()
  })
})
