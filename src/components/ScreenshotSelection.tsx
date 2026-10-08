import type { MouseEvent as ReactMouseEvent } from 'react'
import type { TranslationTarget } from '@/lib/config'
import type { ScreenRegion, ScreenshotTranslationStage } from '@/lib/screenshot-translation'
import { X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import TranslationRetry from '@/components/TranslationRetry'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cancelSelection, discardSelection, revealSelectionWindow, selectionFrame, translateSelection } from '@/lib/screenshot-translation'
import { translationEngineLabel, TranslationError } from '@/lib/translate'

function normalizeSelection(startX: number, startY: number, endX: number, endY: number): ScreenRegion {
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  }
}

const resizeHandles = [
  { edge: 'n', label: '上边', className: '-top-1 left-1 right-1 h-2 cursor-ns-resize' },
  { edge: 's', label: '下边', className: '-bottom-1 left-1 right-1 h-2 cursor-ns-resize' },
  { edge: 'w', label: '左边', className: '-left-1 top-1 bottom-1 w-2 cursor-ew-resize' },
  { edge: 'e', label: '右边', className: '-right-1 top-1 bottom-1 w-2 cursor-ew-resize' },
  { edge: 'nw', label: '左上角', className: '-left-1.5 -top-1.5 size-3 cursor-nwse-resize border border-white bg-black/60' },
  { edge: 'ne', label: '右上角', className: '-right-1.5 -top-1.5 size-3 cursor-nesw-resize border border-white bg-black/60' },
  { edge: 'sw', label: '左下角', className: '-left-1.5 -bottom-1.5 size-3 cursor-nesw-resize border border-white bg-black/60' },
  { edge: 'se', label: '右下角', className: '-right-1.5 -bottom-1.5 size-3 cursor-nwse-resize border border-white bg-black/60' },
] as const

type DragKind = 'draw' | 'move' | typeof resizeHandles[number]['edge']
interface SelectionDrag {
  kind: DragKind
  x: number
  y: number
  original: ScreenRegion
}

export default function ScreenshotSelection() {
  const frame = useMemo(() => selectionFrame(), [])
  const [error, setError] = useState(() => (frame.imageSrc ? '' : '截图文件不存在'))
  const [drag, setDrag] = useState<SelectionDrag | null>(null)
  const [selection, setSelection] = useState<ScreenRegion | null>(null)
  const [isTranslating, setIsTranslating] = useState(false)
  const [stage, setStage] = useState<ScreenshotTranslationStage>('recognizing')
  const [showSlowHint, setShowSlowHint] = useState(false)
  const retryTarget = useRef<TranslationTarget | undefined>()

  useEffect(() => {
    void revealSelectionWindow().catch((err) => {
      setError(err instanceof Error ? err.message : String(err))
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void cancelSelection()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    return () => {
      void discardSelection()
    }
  }, [])

  useEffect(() => {
    if (!drag || isTranslating) {
      return
    }

    const onMove = (event: MouseEvent) => {
      const x = Math.max(0, Math.min(event.clientX, frame.logicalWidth))
      const y = Math.max(0, Math.min(event.clientY, frame.logicalHeight))
      const dx = x - drag.x
      const dy = y - drag.y
      const original = drag.original
      if (drag.kind === 'draw') {
        setSelection(normalizeSelection(drag.x, drag.y, x, y))
      }
      else if (drag.kind === 'move') {
        setSelection({
          ...original,
          x: Math.max(0, Math.min(original.x + dx, frame.logicalWidth - original.width)),
          y: Math.max(0, Math.min(original.y + dy, frame.logicalHeight - original.height)),
        })
      }
      else {
        let left = original.x
        let top = original.y
        let right = original.x + original.width
        let bottom = original.y + original.height
        if (drag.kind.includes('w'))
          left = Math.max(0, Math.min(left + dx, right - 8))
        if (drag.kind.includes('e'))
          right = Math.min(frame.logicalWidth, Math.max(right + dx, left + 8))
        if (drag.kind.includes('n'))
          top = Math.max(0, Math.min(top + dy, bottom - 8))
        if (drag.kind.includes('s'))
          bottom = Math.min(frame.logicalHeight, Math.max(bottom + dy, top + 8))
        setSelection({ x: left, y: top, width: right - left, height: bottom - top })
      }
    }
    const finishDrag = () => setDrag(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', finishDrag)
    window.addEventListener('blur', finishDrag)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', finishDrag)
      window.removeEventListener('blur', finishDrag)
    }
  }, [drag, frame, isTranslating])

  function startDrag(event: ReactMouseEvent, kind: DragKind, original?: ScreenRegion) {
    if (event.button !== 0 || !frame.imageSrc || isTranslating) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    setError('')
    retryTarget.current = undefined
    const x = Math.max(0, Math.min(event.clientX, frame.logicalWidth))
    const y = Math.max(0, Math.min(event.clientY, frame.logicalHeight))
    const rect = original ?? { x, y, width: 0, height: 0 }
    setDrag({ kind, x, y, original: rect })
    if (kind === 'draw')
      setSelection(rect)
  }

  useEffect(() => {
    if (!isTranslating)
      return
    const timeout = setTimeout(() => setShowSlowHint(true), 10_000)
    return () => clearTimeout(timeout)
  }, [isTranslating, stage])

  const selectedEnough = selection && selection.width >= 8 && selection.height >= 8

  async function handleTranslate(target?: TranslationTarget) {
    if (!selection || !frame.imageSrc || isTranslating) {
      return
    }

    setStage('recognizing')
    setShowSlowHint(false)
    setIsTranslating(true)
    setError('')
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
    try {
      retryTarget.current = target ?? retryTarget.current
      await translateSelection(selection, retryTarget.current, (nextStage) => {
        setStage(nextStage)
        setShowSlowHint(false)
      })
    }
    catch (err) {
      if (err instanceof TranslationError) {
        retryTarget.current = err.engine
        setError(`${translationEngineLabel(err.engine)}：${err.message}`)
      }
      else {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
    finally {
      setIsTranslating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 cursor-crosshair overflow-hidden bg-black text-white"
      onMouseDown={event => startDrag(event, 'draw')}
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
          role="region"
          aria-label="截图选区"
          onMouseDown={event => startDrag(event, 'move', selection)}
          className="absolute cursor-move border border-white bg-white/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
          style={{
            left: selection.x,
            top: selection.y,
            width: selection.width,
            height: selection.height,
          }}
        >
          {selectedEnough && !isTranslating && resizeHandles.map(handle => (
            <div
              key={handle.edge}
              title={`调整选区${handle.label}`}
              className={`absolute ${handle.className}`}
              onMouseDown={event => startDrag(event, handle.edge, selection)}
            />
          ))}
        </div>
      )}
      {selectedEnough && !isTranslating && (
        <div
          className="absolute flex gap-2 rounded bg-black/85 p-2 shadow-lg"
          style={{
            left: Math.max(8, Math.min(selection.x + selection.width - 124, frame.logicalWidth - 132)),
            top: Math.max(8, Math.min(selection.y + selection.height + 8, frame.logicalHeight - 48)),
          }}
          onMouseDown={event => event.stopPropagation()}
        >
          <Button size="sm" onClick={() => void handleTranslate()} disabled={isTranslating}>
            {isTranslating ? '翻译中...' : '翻译'}
          </Button>
          <Button size="icon" variant="ghost" onClick={() => void cancelSelection()} aria-label="取消截图翻译">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      {isTranslating && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35">
          <div className="cursor-default space-y-2 rounded bg-black/85 px-3 py-2 text-sm shadow-lg">
            <div className="flex items-center gap-4">
              <div role="status" className="flex items-center gap-2">
                <Spinner role="presentation" aria-hidden />
                {stage === 'recognizing' ? '正在识别文字' : stage === 'translating' ? '正在翻译' : '正在打开译文'}
              </div>
              <Button size="sm" variant="secondary" onClick={() => void cancelSelection()}>
                取消
              </Button>
            </div>
            <p className="text-xs text-white/70">
              {showSlowHint ? '耗时较长，可以取消后重试。' : '按 Esc 也可取消。'}
            </p>
          </div>
        </div>
      )}
      {error && (
        <div
          className="absolute left-1/2 top-1/2 z-30 max-h-[calc(100vh-96px)] w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 -translate-y-1/2 cursor-auto space-y-3 overflow-y-auto rounded bg-red-950/95 p-4 text-sm leading-6 shadow-lg"
          onMouseDown={event => event.stopPropagation()}
        >
          <p role="alert" className="select-text whitespace-pre-wrap [overflow-wrap:anywhere]">{error}</p>
          {selectedEnough && <TranslationRetry onRetry={target => void handleTranslate(target)} disabled={isTranslating} />}
        </div>
      )}
    </div>
  )
}
