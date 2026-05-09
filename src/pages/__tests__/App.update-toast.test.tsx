import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/App'

const { checkForUpdate } = vi.hoisted(() => ({
  checkForUpdate: vi.fn(),
}))

vi.mock('@/lib/updater', () => ({
  checkForUpdate,
  getCurrentVersion: () => Promise.resolve('0.1.30'),
  relaunchApp: vi.fn(),
}))

vi.mock('@/components/CopyText', () => ({
  default: () => <button type="button">复制</button>,
}))

vi.mock('@/components/translate-display', () => ({
  default: () => <div>翻译结果</div>,
}))

vi.mock('@/components/dictionary-display', () => ({
  default: () => <div>词典结果</div>,
}))

describe('App update toast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('DEV', false)
    checkForUpdate.mockResolvedValue({
      available: true,
      update: {
        version: '0.1.31',
        date: '2026-05-09',
        body: 'Release notes',
        downloadAndInstall: vi.fn(),
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('shows the update toast when the startup update check finds a new version', async () => {
    render(<App />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(checkForUpdate).toHaveBeenCalledTimes(1)
    expect(screen.getByText('发现新版本')).toBeInTheDocument()
    expect(screen.getByText('版本 0.1.31 已可用。')).toBeInTheDocument()
  })
})
