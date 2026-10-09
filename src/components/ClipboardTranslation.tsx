import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import TranslateDisplay from '@/components/translate-display'
import { Button } from '@/components/ui/button'

interface ClipboardSession {
  id: number
  sourceText: string
  error: string | null
  permissionRequired: boolean
}

export default function ClipboardTranslation() {
  const [session, setSession] = useState<ClipboardSession | null>(null)
  const [error, setError] = useState('')
  const sessionRef = useRef<ClipboardSession | null>(null)
  const closing = useRef(false)
  const request = useRef({ version: 0 })

  const loadSession = useCallback(async () => {
    const current = ++request.current.version
    try {
      const next = await invoke<ClipboardSession | null>('get_clipboard_translation_session')
      if (request.current.version !== current || closing.current)
        return
      sessionRef.current = next
      setSession(next)
      setError(next ? '' : '快捷翻译已结束，请重新按快捷键。')
    }
    catch {
      if (request.current.version === current && !closing.current)
        setError('读取快捷翻译失败，请重新按快捷键。')
    }
  }, [])

  const close = useCallback(async () => {
    if (closing.current)
      return
    closing.current = true
    ++request.current.version
    setSession(null)
    try {
      await invoke('close_clipboard_translation', { restoreFocus: true, id: sessionRef.current?.id })
    }
    catch {
      closing.current = false
      await loadSession()
      setError('关闭快捷翻译失败，请重试。')
    }
  }, [loadSession])

  const openAccessibilitySettings = async () => {
    setError('')
    try {
      await invoke('open_selection_accessibility_settings')
    }
    catch {
      setError('无法打开系统设置，请在系统设置的「隐私与安全性 → 辅助功能」中授权。')
    }
  }

  useEffect(() => {
    const pending = request.current
    let disposed = false
    let unlisten = () => {}
    void listen<number>('clipboard-translation-changed', ({ payload: id }) => {
      if (disposed || (!closing.current && sessionRef.current?.id === id))
        return
      closing.current = false
      sessionRef.current = null
      setSession(null)
      setError('')
      void loadSession()
    }).then((stop) => {
      if (disposed) {
        stop()
        return
      }
      unlisten = stop
      return loadSession()
    }).catch(() => {
      if (!disposed)
        setError('无法监听快捷翻译，请关闭后重新按快捷键。')
    })

    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        void close()
      }
    }
    window.addEventListener('keydown', keyDown)
    return () => {
      disposed = true
      ++pending.version
      unlisten()
      window.removeEventListener('keydown', keyDown)
    }
  }, [close, loadSession])

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <h1 className="text-sm font-medium">快捷翻译</h1>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="关闭快捷翻译" title="关闭（Esc）" onClick={() => void close()}>
          <X className="size-4" />
        </Button>
      </header>
      {error && <p role="alert" className="p-4 text-sm text-destructive">{error}</p>}
      {session?.error
        ? (
            <div className="space-y-3 p-4">
              <p role="status" className="text-sm text-muted-foreground">{session.error}</p>
              {session.permissionRequired && (
                <Button variant="outline" onClick={() => void openAccessibilitySettings()}>打开辅助功能设置</Button>
              )}
            </div>
          )
        : session && (
          <div key={session.id} className="flex min-h-0 flex-1 flex-col">
            <details className="shrink-0 border-b px-4 py-2 text-sm">
              <summary className="cursor-pointer text-muted-foreground">查看原文</summary>
              <p className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words">{session.sourceText}</p>
            </details>
            <div className="min-h-0 flex-1">
              <TranslateDisplay q={session.sourceText} startDelay={0} clipboardSessionId={session.id} />
            </div>
          </div>
        )}
      {!session && !error && <p role="status" className="p-4 text-sm text-muted-foreground">{closing.current ? '正在关闭…' : '正在读取文字…'}</p>}
    </main>
  )
}
