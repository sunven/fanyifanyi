import type { UpdateContextValue } from '@/contexts/UpdateContext'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Home from '../Home'

vi.mock('@/components/CopyText', () => ({
  default: () => <button type="button">复制</button>,
}))

vi.mock('@/components/translate-display', () => ({
  default: () => <div>翻译结果</div>,
}))

vi.mock('@/components/dictionary-display', () => ({
  default: () => <div>词典结果</div>,
}))

const updateState: UpdateContextValue = {
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

vi.mock('@/contexts/UpdateContext', () => ({
  useUpdate: () => updateState,
  getCurrentVersion: () => Promise.resolve('0.1.30'),
}))

function setUpdateAvailable(version: string) {
  updateState.hasUpdate = true
  updateState.updateInfo = {
    version,
    date: '2026-05-07',
    body: 'Release notes',
  }
  updateState.updateHandle = {
    ...updateState.updateInfo,
    downloadAndInstall: vi.fn(),
  }
}

describe('Home update toast', () => {
  beforeEach(() => {
    updateState.hasUpdate = false
    updateState.updateInfo = null
    updateState.updateHandle = null
    updateState.isChecking = false
    updateState.isDownloading = false
    updateState.error = null
    updateState.isDismissed = false
    updateState.isDevMode = false
    vi.mocked(updateState.checkUpdate).mockClear()
    vi.mocked(updateState.dismissUpdate).mockClear()
    vi.mocked(updateState.resetDismiss).mockClear()
    vi.mocked(updateState.downloadAndInstall).mockClear()
    vi.mocked(updateState.retryDownload).mockClear()
    vi.mocked(updateState.clearError).mockClear()
  })

  it('does not show the update toast when no update is available', () => {
    render(<Home />)

    expect(screen.queryByText('发现新版本')).not.toBeInTheDocument()
    expect(screen.getByText('翻译')).toBeInTheDocument()
  })

  it('shows an update toast with the available version', async () => {
    setUpdateAvailable('0.1.31')

    render(<Home />)

    expect(await screen.findByText('发现新版本')).toBeInTheDocument()
    expect(screen.getByText('版本 0.1.31 已可用。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看更新' })).toBeInTheDocument()
  })

  it('opens Settings from the toast without installing', async () => {
    setUpdateAvailable('0.1.31')

    render(<Home />)

    fireEvent.click(await screen.findByRole('button', { name: '查看更新' }))

    expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument()
    expect(screen.getByText('软件更新')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('0.1.30')).toBeInTheDocument())
    expect(updateState.downloadAndInstall).not.toHaveBeenCalled()
  })

  it('dismisses the toast without skipping the version', async () => {
    setUpdateAvailable('0.1.31')

    render(<Home />)

    fireEvent.click(await screen.findByRole('button', { name: '关闭更新提示' }))

    expect(screen.queryByText('发现新版本')).not.toBeInTheDocument()
    expect(updateState.dismissUpdate).not.toHaveBeenCalled()
  })

  it('does not repeat the same version after dismissing it in one session', async () => {
    setUpdateAvailable('0.1.31')
    const { rerender } = render(<Home />)

    fireEvent.click(await screen.findByRole('button', { name: '关闭更新提示' }))
    rerender(<Home />)

    expect(screen.queryByText('发现新版本')).not.toBeInTheDocument()
  })

  it('shows the toast again when a different version becomes available', async () => {
    setUpdateAvailable('0.1.31')
    const { rerender } = render(<Home />)

    fireEvent.click(await screen.findByRole('button', { name: '关闭更新提示' }))
    setUpdateAvailable('0.1.32')
    rerender(<Home />)

    expect(await screen.findByText('版本 0.1.32 已可用。')).toBeInTheDocument()
  })
})
