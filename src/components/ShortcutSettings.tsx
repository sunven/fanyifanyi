import type { KeyboardEvent } from 'react'
import type { ShortcutSettings as SavedShortcutSettings } from '@/lib/shortcuts'
import { isTauri } from '@tauri-apps/api/core'
import { Keyboard } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DEFAULT_SCREENSHOT_SHORTCUT as DEFAULT_SHORTCUT, loadScreenshotShortcut, saveScreenshotShortcut } from '@/lib/shortcuts'

function displayShortcut(shortcut: string) {
  if (navigator.platform.toLowerCase().includes('mac')) {
    return shortcut.replace(/Ctrl/g, 'Control').replace(/Alt/g, 'Option').replace(/Super/g, 'Command')
  }
  return shortcut
}

export default function ShortcutSettings() {
  const [settings, setSettings] = useState<SavedShortcutSettings | null>(null)
  const [draft, setDraft] = useState(DEFAULT_SHORTCUT)
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    loadScreenshotShortcut().then((loaded) => {
      if (!cancelled) {
        setSettings(loaded)
        setDraft(loaded.shortcut)
        setError(loaded.error || '')
      }
    }).catch(() => {
      if (!cancelled) {
        setError('读取截图快捷键失败，请重试')
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const save = async (enabled: boolean, shortcut: string) => {
    setBusy(true)
    setError('')
    setMessage('')
    setRecording(false)
    try {
      const saved = await saveScreenshotShortcut(enabled, shortcut)
      if (saved.error) {
        setError(saved.error)
        return
      }
      setSettings(saved)
      setDraft(saved.shortcut)
      setMessage('截图快捷键已保存')
    }
    catch (reason) {
      setError(typeof reason === 'string' ? reason : reason instanceof Error ? reason.message : '保存截图快捷键失败，请重试')
    }
    finally {
      setBusy(false)
    }
  }

  const recordShortcut = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!recording || event.key === 'Tab') {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') {
      setRecording(false)
      return
    }
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
      return
    }
    const key = /^Key[A-Z]$/.test(event.code)
      ? event.code.slice(3)
      : /^Digit\d$/.test(event.code)
        ? event.code.slice(5)
        : event.key.toUpperCase()
    if (!(event.ctrlKey || event.altKey || event.metaKey) || !/^(?:[A-Z0-9]|F(?:[1-9]|1\d|2[0-4]))$/.test(key)) {
      setError('请使用 Control、Alt / Option 或 Command 搭配字母、数字或功能键。')
      return
    }
    const modifiers = [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Super'].filter(Boolean)
    setDraft([...modifiers, key].join('+'))
    setRecording(false)
    setError('')
    setMessage('')
  }

  const disabled = !settings?.supported || busy

  return (
    <section className="space-y-4 p-2" aria-labelledby="shortcut-settings-title">
      <div className="flex items-center gap-2">
        <Keyboard className="h-5 w-5 text-primary" />
        <h2 id="shortcut-settings-title" className="text-lg font-semibold tracking-tight">截图快捷键</h2>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <label htmlFor="screenshot-shortcut-enabled" className="text-sm font-medium">启用全局截图快捷键</label>
          <p className="text-sm text-muted-foreground">应用在后台时，也可以用快捷键开始截图翻译。</p>
        </div>
        <input
          id="screenshot-shortcut-enabled"
          type="checkbox"
          role="switch"
          checked={settings?.enabled ?? true}
          disabled={disabled}
          onChange={event => settings && void save(event.target.checked, settings.shortcut)}
          className="mt-1 h-4 w-4 shrink-0 accent-primary"
        />
      </div>
      {settings?.supported
        ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                当前快捷键：
                <span>{displayShortcut(settings.shortcut)}</span>
                {!settings.enabled && '（已停用）'}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Input id="screenshot-shortcut" aria-label="截图快捷键组合" readOnly value={recording ? '请按下组合键...' : displayShortcut(draft)} onKeyDown={recordShortcut} onBlur={() => setRecording(false)} disabled={disabled} className="w-full sm:w-56" />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => {
                    setRecording(true)
                    setError('')
                    document.getElementById('screenshot-shortcut')?.focus()
                  }}
                >
                  {recording ? '录制中...' : '录制快捷键'}
                </Button>
                <Button size="sm" disabled={disabled || recording || draft === settings.shortcut} onClick={() => void save(settings.enabled, draft)}>保存快捷键</Button>
                <Button variant="ghost" size="sm" disabled={disabled || recording} onClick={() => void save(settings.enabled, DEFAULT_SHORTCUT)}>恢复默认</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                点击录制后按下组合键，按 Esc 取消；保存后生效。默认：
                {displayShortcut(DEFAULT_SHORTCUT)}
                。
              </p>
            </div>
          )
        : settings
          ? <p className="text-sm text-muted-foreground">{isTauri() ? '当前平台暂不支持全局截图快捷键。' : '截图快捷键仅在桌面应用中可用。'}</p>
          : !error && <p className="text-xs text-muted-foreground">正在加载快捷键设置...</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
    </section>
  )
}
