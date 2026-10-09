import type { TranslationTarget } from '@/lib/config'
import type { TranslationResult } from '@/lib/translate'
import { invoke } from '@tauri-apps/api/core'
import { StopCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Streamdown } from 'streamdown'
import CopyTextButton from '@/components/CopyText'
import TranslationRetry from '@/components/TranslationRetry'
import { recordTranslation } from '@/lib/history'
import { translate, translationEngineLabel, TranslationError } from '@/lib/translate'

interface TranslateDisplayProps {
  q: string
  startDelay?: number
  clipboardSessionId?: number
}

function TranslationSkeleton() {
  return (
    <div className="space-y-3 pt-1" aria-hidden="true">
      <div className="h-3 w-4/5 animate-pulse rounded-sm bg-muted" />
      <div className="h-3 w-full animate-pulse rounded-sm bg-muted" />
      <div className="h-3 w-11/12 animate-pulse rounded-sm bg-muted" />
      <div className="h-3 w-2/3 animate-pulse rounded-sm bg-muted" />
    </div>
  )
}

export default function TranslateDisplay({ q, startDelay = 1000, clipboardSessionId }: TranslateDisplayProps) {
  const [result, setResult] = useState<TranslationResult | null>(null)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const requestRef = useRef(0)
  const retryTargetRef = useRef<TranslationTarget | undefined>()
  const contentRef = useRef<HTMLDivElement>(null)

  const translateText = useCallback(async (target?: TranslationTarget) => {
    if (!q.trim())
      return
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    const request = ++requestRef.current
    const selected = target ?? retryTargetRef.current
    retryTargetRef.current = selected
    setIsLoading(true)
    setError('')
    setHistoryError('')
    setResult(null)
    try {
      const translated = await translate(q, 'desk', controller.signal, selected)
      if (clipboardSessionId !== undefined && !await invoke<boolean>('is_clipboard_translation_current', { id: clipboardSessionId }))
        return
      if (request !== requestRef.current || controller.signal.aborted || !translated)
        return
      setResult(translated)
      try {
        await recordTranslation(q, 'desk', translated, clipboardSessionId)
      }
      catch {
        if (request === requestRef.current && !controller.signal.aborted)
          setHistoryError('译文已完成，但未能保存到本地历史。')
      }
    }
    catch (err) {
      if (request !== requestRef.current || controller.signal.aborted)
        return
      if (err instanceof TranslationError) {
        retryTargetRef.current = err.engine
        setError(`${translationEngineLabel(err.engine)}：${err.message}`)
      }
      else {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
    finally {
      if (request === requestRef.current && !controller.signal.aborted)
        setIsLoading(false)
    }
  }, [q, clipboardSessionId])

  useEffect(() => {
    retryTargetRef.current = undefined
    setResult(null)
    setError('')
    setHistoryError('')
    setIsLoading(false)
    if (clipboardSessionId !== undefined)
      contentRef.current?.focus({ preventScroll: true })
    const timer = setTimeout(() => {
      void translateText()
    }, startDelay)
    return () => {
      clearTimeout(timer)
      abortControllerRef.current?.abort()
    }
  }, [translateText, startDelay, clipboardSessionId])

  const handleStop = () => {
    ++requestRef.current
    abortControllerRef.current?.abort()
    setIsLoading(false)
  }
  const translatedText = result?.text ?? ''

  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium tracking-wide text-muted-foreground">
          翻译结果
          {result && <span className="ml-2 font-normal">{translationEngineLabel(result.engine)}</span>}
        </div>
        <div className="flex items-center gap-1">
          <CopyTextButton text={translatedText} />
          {isLoading && (
            <button
              type="button"
              onClick={handleStop}
              className="rounded-md p-1 text-muted-foreground transition-colors duration-200 hover:text-foreground outline-none active:scale-95"
              title="停止翻译"
            >
              <StopCircle size={18} />
            </button>
          )}
        </div>
      </div>
      {historyError && <p role="status" className="text-xs text-amber-700">{historyError}</p>}
      <div
        ref={contentRef}
        role={clipboardSessionId === undefined ? undefined : 'region'}
        aria-label={clipboardSessionId === undefined ? undefined : '译文'}
        tabIndex={clipboardSessionId === undefined ? undefined : 0}
        className="prose prose-neutral dark:prose-invert max-w-none flex-1 overflow-y-auto pr-2 break-words prose-p:leading-relaxed prose-headings:tracking-tight"
      >
        {!q && !translatedText && !error
          ? (
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                输入原文。停顿片刻后，译文会出现在这里。
              </p>
            )
          : null}
        {error
          ? (
              <div className="space-y-3">
                <p role="alert" className="text-sm text-destructive">{error}</p>
                <TranslationRetry onRetry={target => void translateText(target)} disabled={isLoading} />
              </div>
            )
          : null}
        {isLoading && !translatedText
          ? (
              <div aria-live="polite">
                <p className="sr-only">翻译中</p>
                <TranslationSkeleton />
              </div>
            )
          : null}
        {translatedText
          ? (
              <Streamdown
                isAnimating={isLoading}
                controls={true}
              >
                {translatedText}
              </Streamdown>
            )
          : null}
      </div>
    </div>
  )
}
