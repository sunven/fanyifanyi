import type { ScreenRegion } from '@/lib/screenshot-translation'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { discardSelection, selectionFrame, translateSelection } from '@/lib/screenshot-translation'

function normalizeSelection(startX: number, startY: number, endX: number, endY: number): ScreenRegion {
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  }
}

export default function ScreenshotSelection() {
  const frame = useMemo(() => selectionFrame(), [])
  const [error, setError] = useState('')
  const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null)
  const [selection, setSelection] = useState<ScreenRegion | null>(null)
  const [isTranslating, setIsTranslating] = useState(false)

  const closeSelectionWindow = useCallback(async () => {
    await discardSelection()
    await getCurrentWindow().destroy()
  }, [])

  useEffect(() => {
    async function showWindow() {
      try {
        if (!frame.imageSrc) {
          setError('截图文件不存在')
        }
        const selectionWindow = getCurrentWindow()
        await selectionWindow.show()
        const appWindow = await WebviewWindow.getByLabel('main')
        await appWindow?.show()
        await selectionWindow.setFocus()
      }
      catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    void showWindow()
  }, [frame.imageSrc])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void closeSelectionWindow()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeSelectionWindow])

  useEffect(() => {
    return () => {
      void discardSelection()
    }
  }, [])

  const selectedEnough = selection && selection.width >= 8 && selection.height >= 8

  async function handleTranslate() {
    if (!selection || !frame.imageSrc) {
      return
    }

    setIsTranslating(true)
    setError('')
    try {
      await translateSelection(selection)
      await getCurrentWindow().destroy()
    }
    catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    finally {
      setIsTranslating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 cursor-crosshair overflow-hidden bg-black text-white"
      onMouseDown={(event) => {
        if (!frame.imageSrc || isTranslating) {
          return
        }
        setError('')
        setDragStart({ x: event.clientX, y: event.clientY })
        setSelection(normalizeSelection(event.clientX, event.clientY, event.clientX, event.clientY))
      }}
      onMouseMove={(event) => {
        if (!dragStart || isTranslating) {
          return
        }
        setSelection(normalizeSelection(dragStart.x, dragStart.y, event.clientX, event.clientY))
      }}
      onMouseUp={() => setDragStart(null)}
    >
      {frame.imageSrc && (
        <img
          src={frame.imageSrc}
          alt=""
          className="absolute inset-0 h-full w-full select-none object-fill"
          draggable={false}
        />
      )}
      <div className="absolute inset-0 bg-black/20" />
      {!frame.imageSrc && !error && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-black/75 px-3 py-2 text-sm">
          准备截图...
        </div>
      )}
      {selection && (
        <div
          className="absolute border border-white bg-white/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
          style={{
            left: selection.x,
            top: selection.y,
            width: selection.width,
            height: selection.height,
          }}
        />
      )}
      {selectedEnough && (
        <div
          className="absolute flex gap-2 rounded bg-black/85 p-2 shadow-lg"
          style={{
            left: Math.max(8, Math.min(selection.x + selection.width - 124, frame.logicalWidth - 132)),
            top: Math.max(8, Math.min(selection.y + selection.height + 8, frame.logicalHeight - 48)),
          }}
          onMouseDown={event => event.stopPropagation()}
        >
          <Button size="sm" onClick={handleTranslate} disabled={isTranslating}>
            {isTranslating ? '翻译中...' : '翻译'}
          </Button>
          <Button size="icon" variant="ghost" onClick={() => void closeSelectionWindow()} aria-label="取消截图翻译">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      {error && (
        <div className="absolute bottom-4 left-1/2 max-w-[min(560px,calc(100vw-32px))] -translate-x-1/2 rounded bg-red-950/90 px-3 py-2 text-sm shadow-lg">
          {error}
        </div>
      )}
    </div>
  )
}
