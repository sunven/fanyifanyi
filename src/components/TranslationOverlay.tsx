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
    <div className="relative h-screen w-screen overflow-hidden border border-border bg-background p-0.5 text-xs leading-3 text-foreground shadow-xl">
      <Button
        size="icon"
        variant="ghost"
        onClick={() => getCurrentWindow().destroy()}
        aria-label="关闭截图翻译"
        className="absolute top-0.5 right-0.5 h-3 w-3 bg-background/80"
      >
        <X className="h-2.5 w-2.5" />
      </Button>
      <div className="break-words pr-3">
        {payload.text}
      </div>
    </div>
  )
}
