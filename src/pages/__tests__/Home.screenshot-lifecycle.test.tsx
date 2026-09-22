import type { ReactNode } from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Home from '../Home'

const { closeRegistration, getAllWindows, mainWindow, unlisten, updateState } = vi.hoisted(() => {
  const closeRegistration: {
    handler?: (event: { preventDefault: () => void }) => Promise<void>
  } = {}

  return {
    closeRegistration,
    getAllWindows: vi.fn(),
    mainWindow: {
      destroy: vi.fn().mockResolvedValue(undefined),
      onCloseRequested: vi.fn(),
    },
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
  }
})

vi.mock('@tauri-apps/api/window', () => ({
  cursorPosition: vi.fn(),
  getCurrentWindow: () => mainWindow,
  monitorFromPoint: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: vi.fn(),
  invoke: vi.fn(),
  isTauri: () => true,
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: class MockWebviewWindow {
    static getAll() {
      return getAllWindows()
    }
  },
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
    delete closeRegistration.handler
    mainWindow.destroy.mockResolvedValue(undefined)
    mainWindow.onCloseRequested.mockImplementation(async (handler) => {
      closeRegistration.handler = handler
      return unlisten
    })
  })

  it('destroys screenshot windows before closing the main window', async () => {
    const closeOrder: string[] = []
    let finishOverlayDestroy: (() => void) | undefined
    const selectionWindow = {
      label: 'screenshot-selection-1',
      destroy: vi.fn(async () => {
        closeOrder.push('selection')
      }),
    }
    const overlayWindow = {
      label: 'translation-overlay-1',
      destroy: vi.fn(() => new Promise<void>((resolve) => {
        finishOverlayDestroy = () => {
          closeOrder.push('overlay')
          resolve()
        }
      })),
    }
    const unrelatedWindow = {
      label: 'settings',
      destroy: vi.fn().mockResolvedValue(undefined),
    }
    getAllWindows.mockResolvedValue([selectionWindow, overlayWindow, unrelatedWindow])
    mainWindow.destroy.mockImplementation(async () => {
      closeOrder.push('main')
    })

    render(<Home />)

    await waitFor(() => expect(mainWindow.onCloseRequested).toHaveBeenCalledTimes(1))
    const event = { preventDefault: vi.fn() }

    const closePromise = closeRegistration.handler?.(event)

    await waitFor(() => expect(overlayWindow.destroy).toHaveBeenCalledTimes(1))
    expect(mainWindow.destroy).not.toHaveBeenCalled()

    finishOverlayDestroy?.()
    await act(async () => closePromise)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(selectionWindow.destroy).toHaveBeenCalledTimes(1)
    expect(overlayWindow.destroy).toHaveBeenCalledTimes(1)
    expect(unrelatedWindow.destroy).not.toHaveBeenCalled()
    expect(mainWindow.destroy).toHaveBeenCalledTimes(1)
    expect(closeOrder).toEqual(['selection', 'overlay', 'main'])
  })

  it('removes the main-window close listener when Home unmounts', async () => {
    const { unmount } = render(<Home />)

    await waitFor(() => expect(mainWindow.onCloseRequested).toHaveBeenCalledTimes(1))
    unmount()

    expect(unlisten).toHaveBeenCalledTimes(1)
  })

  it('handles close-listener registration failures', async () => {
    const error = new Error('listen failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mainWindow.onCloseRequested.mockRejectedValueOnce(error)

    render(<Home />)

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith('无法注册截图窗口清理监听', error)
    })
    consoleError.mockRestore()
  })
})
