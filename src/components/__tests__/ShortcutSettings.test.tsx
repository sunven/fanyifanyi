import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ShortcutSettings from '../ShortcutSettings'

const { loadScreenshotShortcut, saveScreenshotShortcut, isTauri } = vi.hoisted(() => ({
  loadScreenshotShortcut: vi.fn(),
  saveScreenshotShortcut: vi.fn(),
  isTauri: vi.fn(),
}))

vi.mock('@/lib/shortcuts', () => ({ DEFAULT_SCREENSHOT_SHORTCUT: 'Ctrl+Alt+T', loadScreenshotShortcut, saveScreenshotShortcut }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri }))

const saved = { supported: true, enabled: true, shortcut: 'Ctrl+Alt+T' }

async function recordNewShortcut() {
  fireEvent.click(await screen.findByRole('button', { name: '录制快捷键' }))
  const input = screen.getByRole('textbox', { name: '截图快捷键组合' })
  expect(input).toHaveFocus()
  fireEvent.keyDown(input, { code: 'KeyK', key: 'k', ctrlKey: true, shiftKey: true })
}

describe('screenshot shortcut settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadScreenshotShortcut.mockResolvedValue(saved)
    saveScreenshotShortcut.mockImplementation(async (enabled, shortcut) => ({ supported: true, enabled, shortcut }))
    isTauri.mockReturnValue(true)
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Win32' })
  })

  it('records a draft and saves it only when requested', async () => {
    render(<ShortcutSettings />)
    await recordNewShortcut()
    expect(screen.getByRole('textbox')).toHaveValue('Ctrl+Shift+K')
    expect(screen.getByText('Ctrl+Alt+T', { selector: 'span' })).toBeInTheDocument()
    expect(saveScreenshotShortcut).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '保存快捷键' }))
    expect(await screen.findByRole('status')).toHaveTextContent('截图快捷键已保存')
    expect(saveScreenshotShortcut).toHaveBeenCalledWith(true, 'Ctrl+Shift+K')
    expect(screen.getByText('Ctrl+Shift+K', { selector: 'span' })).toBeInTheDocument()
  })

  it('retains the previous binding if registration fails', async () => {
    saveScreenshotShortcut.mockRejectedValueOnce(new Error('快捷键已被占用'))
    render(<ShortcutSettings />)
    await recordNewShortcut()
    fireEvent.click(screen.getByRole('button', { name: '保存快捷键' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('快捷键已被占用')
    expect(screen.getByText('Ctrl+Alt+T', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('Ctrl+Shift+K')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not report success when the service returns an error', async () => {
    saveScreenshotShortcut.mockResolvedValueOnce({ ...saved, shortcut: 'Ctrl+Shift+K', error: '注册失败' })
    render(<ShortcutSettings />)
    await recordNewShortcut()
    fireEvent.click(screen.getByRole('button', { name: '保存快捷键' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('注册失败')
    expect(screen.getByText('Ctrl+Alt+T', { selector: 'span' })).toBeInTheDocument()
  })

  it('disables the saved binding without applying an unsaved draft', async () => {
    render(<ShortcutSettings />)
    await recordNewShortcut()
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(screen.getByRole('switch')).not.toBeChecked())
    expect(saveScreenshotShortcut).toHaveBeenCalledWith(false, 'Ctrl+Alt+T')
    expect(screen.getByRole('textbox')).toHaveValue('Ctrl+Alt+T')
  })

  it('keeps the enabled state when disabling fails', async () => {
    saveScreenshotShortcut.mockRejectedValueOnce(new Error('保存失败'))
    render(<ShortcutSettings />)
    const toggle = screen.getByRole('switch')
    await waitFor(() => expect(toggle).toBeEnabled())
    fireEvent.click(toggle)
    expect(await screen.findByRole('alert')).toHaveTextContent('保存失败')
    expect(toggle).toBeChecked()
  })

  it('restores the default binding through the save operation', async () => {
    loadScreenshotShortcut.mockResolvedValueOnce({ ...saved, shortcut: 'Ctrl+Shift+K' })
    render(<ShortcutSettings />)
    fireEvent.click(await screen.findByRole('button', { name: '恢复默认' }))
    expect(await screen.findByRole('status')).toHaveTextContent('截图快捷键已保存')
    expect(saveScreenshotShortcut).toHaveBeenCalledWith(true, 'Ctrl+Alt+T')
    expect(screen.getByRole('textbox')).toHaveValue('Ctrl+Alt+T')
  })

  it('displays macOS names and records the physical key with Option held', async () => {
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' })
    render(<ShortcutSettings />)
    expect(await screen.findByRole('textbox')).toHaveValue('Control+Option+T')
    fireEvent.click(screen.getByRole('button', { name: '录制快捷键' }))
    fireEvent.keyDown(screen.getByRole('textbox'), { code: 'KeyK', key: '˚', ctrlKey: true, altKey: true })
    expect(screen.getByRole('textbox')).toHaveValue('Control+Option+K')
    fireEvent.click(screen.getByRole('button', { name: '保存快捷键' }))
    await waitFor(() => expect(saveScreenshotShortcut).toHaveBeenCalledWith(true, 'Ctrl+Alt+K'))
  })

  it('rejects unmodified keys and lets Escape cancel recording', async () => {
    render(<ShortcutSettings />)
    fireEvent.click(await screen.findByRole('button', { name: '录制快捷键' }))
    fireEvent.keyDown(screen.getByRole('textbox'), { code: 'KeyK', key: 'k' })
    expect(screen.getByRole('alert')).toHaveTextContent('请使用 Control')
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
    expect(screen.getByRole('textbox')).toHaveValue('Ctrl+Alt+T')
    expect(saveScreenshotShortcut).not.toHaveBeenCalled()
  })

  it('explains unsupported desktop platforms', async () => {
    loadScreenshotShortcut.mockResolvedValueOnce({ ...saved, supported: false })
    render(<ShortcutSettings />)
    expect(await screen.findByText('当前平台暂不支持全局截图快捷键。')).toBeInTheDocument()
    expect(screen.getByRole('switch')).toBeDisabled()
    expect(screen.queryByRole('button', { name: '录制快捷键' })).not.toBeInTheDocument()
  })

  it('explains browser preview limitations', async () => {
    isTauri.mockReturnValue(false)
    loadScreenshotShortcut.mockResolvedValueOnce({ ...saved, supported: false })
    render(<ShortcutSettings />)
    expect(await screen.findByText('截图快捷键仅在桌面应用中可用。')).toBeInTheDocument()
  })
})
