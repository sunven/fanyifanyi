import type { ReactNode } from 'react'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Home from '../Home'

const { bindAppWindowClose, unlisten, updateState } = vi.hoisted(() => ({
  bindAppWindowClose: vi.fn(),
  unlisten: vi.fn(),
  updateState: {
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
  },
}))

vi.mock('@/lib/screenshot-translation', () => ({
  bindAppWindowClose,
  startScreenshotTranslation: vi.fn(),
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

vi.mock('@/components/WindowTitleBar', () => ({
  WindowTitleBar: ({ children, center }: { children?: ReactNode, center?: ReactNode }) => (
    <div>
      {center}
      {children}
    </div>
  ),
  TitleBarSpacer: () => null,
  NonMacOnly: () => null,
}))

vi.mock('../Settings', () => ({
  default: () => <div>设置</div>,
}))

vi.mock('@/contexts/UpdateContext', () => ({
  // eslint-disable-next-line react-hooks-extra/no-unnecessary-use-prefix
  useUpdate: () => updateState,
}))

describe('home screenshot window lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    bindAppWindowClose.mockResolvedValue(unlisten)
  })

  it('binds app-window close while mounted and unbinds on unmount', async () => {
    const { unmount } = render(<Home />)

    await waitFor(() => expect(bindAppWindowClose).toHaveBeenCalledTimes(1))
    unmount()

    expect(unlisten).toHaveBeenCalledTimes(1)
  })
})
