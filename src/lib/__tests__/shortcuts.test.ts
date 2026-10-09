import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bindScreenshotShortcut, loadClipboardShortcut, loadScreenshotShortcut, loadSelectionShortcut, saveClipboardShortcut, saveScreenshotShortcut, saveSelectionShortcut } from '../shortcuts'

const { invoke, isTauri, listen } = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
  listen: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke, isTauri }))
vi.mock('@tauri-apps/api/event', () => ({ listen }))

describe('screenshot shortcut events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isTauri.mockReturnValue(true)
    invoke.mockResolvedValue({ supported: true, enabled: true, shortcut: 'Ctrl+Alt+T', error: null })
    listen.mockResolvedValue(vi.fn())
  })

  it('uses distinct clipboard commands and reports browser support accurately', async () => {
    await loadClipboardShortcut()
    expect(invoke).toHaveBeenCalledWith('get_clipboard_shortcut')
    await saveClipboardShortcut(false, 'Ctrl+Alt+C')
    expect(invoke).toHaveBeenCalledWith('configure_clipboard_shortcut', { enabled: false, shortcut: 'Ctrl+Alt+C' })
    isTauri.mockReturnValue(false)
    invoke.mockClear()
    await expect(loadClipboardShortcut()).resolves.toMatchObject({ supported: false, enabled: false, shortcut: 'Ctrl+Alt+C' })
    await expect(saveClipboardShortcut(true, 'Ctrl+Alt+C')).rejects.toThrow('仅支持 macOS')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('uses distinct selection commands and reports browser support accurately', async () => {
    await loadSelectionShortcut()
    expect(invoke).toHaveBeenCalledWith('get_selection_shortcut')
    await saveSelectionShortcut(false, 'Ctrl+Alt+D')
    expect(invoke).toHaveBeenCalledWith('configure_selection_shortcut', { enabled: false, shortcut: 'Ctrl+Alt+D' })
    isTauri.mockReturnValue(false)
    invoke.mockClear()
    await expect(loadSelectionShortcut()).resolves.toMatchObject({ supported: false, enabled: false, shortcut: 'Ctrl+Alt+D' })
    await expect(saveSelectionShortcut(true, 'Ctrl+Alt+D')).rejects.toThrow('仅支持 macOS')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('triggers screenshots until the listener is disposed', async () => {
    let trigger: (() => void) | undefined
    const unlisten = vi.fn()
    listen.mockImplementation(async (_event: string, handler: () => void) => {
      trigger = handler
      return unlisten
    })
    const onTrigger = vi.fn()
    const onError = vi.fn()

    const stop = await bindScreenshotShortcut(onTrigger, onError)
    trigger?.()
    expect(onTrigger).toHaveBeenCalledTimes(1)

    stop()
    stop()
    trigger?.()

    expect(listen).toHaveBeenCalledWith('screenshot-shortcut', expect.any(Function))
    expect(unlisten).toHaveBeenCalledTimes(1)
    expect(onTrigger).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports a startup registration failure while retaining a disposable listener', async () => {
    const unlisten = vi.fn()
    listen.mockResolvedValueOnce(unlisten)
    invoke.mockResolvedValueOnce({ supported: true, enabled: true, shortcut: 'Ctrl+Alt+T', error: '快捷键注册失败：already registered' })
    const onError = vi.fn()

    const stop = await bindScreenshotShortcut(vi.fn(), onError)

    expect(onError).toHaveBeenCalledWith('快捷键注册失败：already registered')
    stop()
    expect(unlisten).toHaveBeenCalledOnce()
  })

  it('reports status read failures without losing the listener cleanup', async () => {
    const unlisten = vi.fn()
    listen.mockResolvedValueOnce(unlisten)
    invoke.mockRejectedValueOnce(new Error('读取失败'))
    const onError = vi.fn()

    const stop = await bindScreenshotShortcut(vi.fn(), onError)

    expect(onError).toHaveBeenCalledWith('读取失败')
    stop()
    expect(unlisten).toHaveBeenCalledOnce()
  })

  it('reports listener registration failures', async () => {
    listen.mockRejectedValueOnce('监听失败')
    const onError = vi.fn()

    const stop = await bindScreenshotShortcut(vi.fn(), onError)

    expect(onError).toHaveBeenCalledWith('监听失败')
    expect(() => stop()).not.toThrow()
  })

  it('uses the Rust settings commands and preserves save errors', async () => {
    const saved = { supported: true, enabled: false, shortcut: 'Ctrl+Alt+Y', error: null }
    invoke.mockResolvedValueOnce(saved)
    await expect(loadScreenshotShortcut()).resolves.toEqual(saved)
    expect(invoke).toHaveBeenCalledWith('get_screenshot_shortcut')

    invoke.mockResolvedValueOnce(saved)
    await expect(saveScreenshotShortcut(false, 'Ctrl+Alt+Y')).resolves.toEqual(saved)
    expect(invoke).toHaveBeenCalledWith('configure_screenshot_shortcut', { enabled: false, shortcut: 'Ctrl+Alt+Y' })

    invoke.mockRejectedValueOnce('注册失败：already registered')
    await expect(saveScreenshotShortcut(true, 'Ctrl+Alt+Y')).rejects.toBe('注册失败：already registered')
  })

  it('does not access native shortcuts in a browser preview', async () => {
    isTauri.mockReturnValue(false)
    const onError = vi.fn()

    await expect(loadScreenshotShortcut()).resolves.toMatchObject({ supported: false, enabled: false })
    const stop = await bindScreenshotShortcut(vi.fn(), onError)
    stop()

    expect(listen).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })
})
