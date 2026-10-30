import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Settings from '../Settings'

vi.mock('@/components/HistorySettings', () => ({ default: () => null }))
vi.mock('@/components/ShortcutSettings', () => ({ default: () => null }))
vi.mock('@/lib/ai', () => ({ testAIConfig: vi.fn() }))
vi.mock('@/lib/updater', () => ({ getCurrentVersion: () => new Promise<string>(() => {}) }))

const updateState = {
  hasUpdate: true,
  updateInfo: { version: '0.1.45', date: '2026-10-30', body: 'Release notes' },
  updateHandle: {
    version: '0.1.45',
    date: '2026-10-30',
    body: 'Release notes',
    downloadAndInstall: vi.fn(),
  },
  isChecking: false,
  isDownloading: true,
  downloadProgress: 42,
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
  getCurrentVersion: () => new Promise<string>(() => {}),
  useUpdate: () => updateState,
}))

describe('settings update progress', () => {
  it('shows the download percentage and progress bar', async () => {
    render(<Settings />)

    await waitFor(() => {
      expect(screen.getByRole('progressbar', { name: '更新下载进度' })).toBeInTheDocument()
    })
    expect(screen.getByText(/正在下载更新/)).toHaveTextContent('正在下载更新... 42%')
    expect(screen.getByRole('progressbar', { name: '更新下载进度' })).toHaveAttribute('aria-valuenow', '42')
  })
})
