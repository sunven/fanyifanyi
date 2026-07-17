import { getCurrentWindow } from '@tauri-apps/api/window'
import { X } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { clearTranslationOverlayPayload, readTranslationOverlayPayload } from '@/lib/screenshot-translation'

export default function TranslationOverlay() {
  const payload = useMemo(() => readTranslationOverlayPayload(), [])

  useEffect(() => {
    clearTranslationOverlayPayload()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        getCurrentWindow().destroy()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!payload) {
    return null
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-950 shadow-xl dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50">
      <Button
        size="icon"
        variant="ghost"
        onClick={() => getCurrentWindow().destroy()}
        aria-label="关闭截图翻译"
        className="absolute right-1 top-1 h-6 w-6 bg-white/80 dark:bg-slate-950/80"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
      <div className="break-words pr-7">
        {payload.text}
      </div>
    </div>
  )
}
