import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export const DEFAULT_SCREENSHOT_SHORTCUT = 'Ctrl+Alt+T'

export interface ShortcutSettings {
  supported: boolean
  enabled: boolean
  shortcut: string
  error?: string | null
}

export async function loadScreenshotShortcut(): Promise<ShortcutSettings> {
  if (!isTauri()) {
    return { supported: false, enabled: false, shortcut: DEFAULT_SCREENSHOT_SHORTCUT, error: null }
  }
  return invoke<ShortcutSettings>('get_screenshot_shortcut')
}

export async function saveScreenshotShortcut(enabled: boolean, shortcut: string): Promise<ShortcutSettings> {
  if (!isTauri()) {
    throw new Error('全局截图快捷键仅支持 macOS 桌面应用')
  }
  return invoke<ShortcutSettings>('configure_screenshot_shortcut', { enabled, shortcut })
}

export async function bindScreenshotShortcut(
  onTrigger: () => void,
  onError: (message: string) => void,
): Promise<() => void> {
  if (!isTauri()) {
    return () => {}
  }
  let active = true
  let unlisten = () => {}
  try {
    unlisten = await listen('screenshot-shortcut', () => {
      if (active) {
        onTrigger()
      }
    })
    const settings = await loadScreenshotShortcut()
    if (settings.error) {
      onError(settings.error)
    }
  }
  catch (error) {
    onError(error instanceof Error ? error.message : String(error))
  }
  return () => {
    if (active) {
      active = false
      unlisten()
    }
  }
}
