import { getCurrentWindow } from '@tauri-apps/api/window'
import { X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { prepareTranslationOverlay, readTranslationOverlay, reportTranslationOverlayError } from '@/lib/screenshot-translation'

export default function TranslationOverlay() {
  const overlay = useMemo(() => readTranslationOverlay(), [])
  const [view, setView] = useState<'translation' | 'original'>('translation')
  const [imageStatus, setImageStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const measurementRef = useRef<HTMLDivElement>(null)
  const translationRef = useRef<HTMLDivElement>(null)
  const translationScrollTop = useRef(0)

  useEffect(() => {
    let cancelled = false

    async function prepare() {
      if (!overlay) {
        throw new Error('截图翻译内容不存在')
      }

      await document.fonts?.ready
      if (cancelled) {
        return
      }

      await prepareTranslationOverlay((width) => {
        const measurement = measurementRef.current
        if (!measurement) {
          throw new Error('无法测量译文窗口')
        }
        measurement.style.width = `${width}px`
        return Math.ceil(measurement.getBoundingClientRect().height)
      })
    }

    void prepare().catch((err) => {
      if (!cancelled) {
        void reportTranslationOverlayError(err instanceof Error ? err.message : String(err)).catch(() => undefined)
      }
    })

    return () => {
      cancelled = true
    }
  }, [overlay])

  useLayoutEffect(() => {
    if (view === 'translation' && translationRef.current) {
      translationRef.current.scrollTop = translationScrollTop.current
    }
  }, [view])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void getCurrentWindow().destroy()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!overlay) {
    return null
  }

  const translation = (
    <div className="whitespace-pre-wrap break-words p-2 [overflow-wrap:anywhere]">
      {imageStatus === 'error' && (
        <p role="status" className="mb-2 text-xs text-muted-foreground">
          原图加载失败，仍可阅读译文。
        </p>
      )}
      <div>{overlay.text}</div>
    </div>
  )

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden border border-border bg-background text-[14px] leading-[22px] text-foreground shadow-xl">
      <div
        data-tauri-drag-region="true"
        className="flex h-8 shrink-0 cursor-move select-none items-center justify-between gap-1 border-b border-border px-1"
      >
        <div role="group" aria-label="显示内容" className="flex gap-1">
          <Button
            size="sm"
            variant={view === 'translation' ? 'secondary' : 'ghost'}
            aria-pressed={view === 'translation'}
            onClick={() => setView('translation')}
            className="h-6 px-2 text-xs focus-visible:ring-2 focus-visible:ring-ring"
          >
            译文
          </Button>
          <Button
            size="sm"
            variant={view === 'original' ? 'secondary' : 'ghost'}
            aria-pressed={view === 'original'}
            disabled={imageStatus !== 'ready'}
            title={imageStatus === 'error' ? '原图加载失败' : imageStatus === 'loading' ? '原图加载中' : undefined}
            onClick={() => {
              if (view === 'translation') {
                translationScrollTop.current = translationRef.current?.scrollTop ?? 0
              }
              setView('original')
            }}
            className="h-6 px-2 text-xs focus-visible:ring-2 focus-visible:ring-ring"
          >
            原图
          </Button>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => void getCurrentWindow().destroy()}
          aria-label="关闭截图翻译"
          className="h-6 w-6 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div
        ref={translationRef}
        role="region"
        aria-label="译文"
        tabIndex={0}
        hidden={view !== 'translation'}
        className="min-h-0 flex-1 overflow-auto"
      >
        {translation}
      </div>
      <div
        role="region"
        aria-label="原图"
        tabIndex={0}
        hidden={view !== 'original'}
        className="min-h-0 flex-1 overflow-auto"
      >
        <div
          className="relative overflow-hidden"
          style={{ width: overlay.original.region.width, height: overlay.original.region.height }}
        >
          <img
            src={overlay.original.src}
            alt="本次选区原图"
            draggable={false}
            onLoad={() => setImageStatus('ready')}
            onError={() => {
              setImageStatus('error')
              setView('translation')
            }}
            className="absolute max-w-none select-none"
            style={{
              left: -overlay.original.region.x,
              top: -overlay.original.region.y,
              width: overlay.original.imageWidth,
              height: overlay.original.imageHeight,
            }}
          />
        </div>
      </div>
      <div
        ref={measurementRef}
        aria-hidden
        className="pointer-events-none invisible fixed left-0 top-0 border border-border"
      >
        <div className="h-8" />
        {translation}
      </div>
    </div>
  )
}
