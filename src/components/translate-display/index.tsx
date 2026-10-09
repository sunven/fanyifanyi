import { StopCircle } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Streamdown } from 'streamdown'
import CopyTextButton from '@/components/CopyText'
import TranslationRetry from '@/components/TranslationRetry'
import { translationEngineLabel, TranslationError } from '@/lib/translate'
import { useTextTranslation } from '@/lib/use-text-translation'

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
  const { result, error, historySaveFailed, isLoading, retry, stop } = useTextTranslation(q, { startDelay, clipboardSessionId })
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (clipboardSessionId !== undefined)
      contentRef.current?.focus({ preventScroll: true })
  }, [q, startDelay, clipboardSessionId])

  const errorMessage = error instanceof TranslationError ? `${translationEngineLabel(error.engine)}：${error.message}` : error?.message ?? ''
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
              onClick={stop}
              className="rounded-md p-1 text-muted-foreground transition-colors duration-200 hover:text-foreground outline-none active:scale-95"
              title="停止翻译"
            >
              <StopCircle size={18} />
            </button>
          )}
        </div>
      </div>
      {historySaveFailed && <p role="status" className="text-xs text-amber-700">译文已完成，但未能保存到本地历史。</p>}
      <div
        ref={contentRef}
        role={clipboardSessionId === undefined ? undefined : 'region'}
        aria-label={clipboardSessionId === undefined ? undefined : '译文'}
        tabIndex={clipboardSessionId === undefined ? undefined : 0}
        className="prose prose-neutral dark:prose-invert max-w-none flex-1 overflow-y-auto pr-2 break-words prose-p:leading-relaxed prose-headings:tracking-tight"
      >
        {!q && !translatedText && !errorMessage
          ? (
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                输入原文。停顿片刻后，译文会出现在这里。
              </p>
            )
          : null}
        {errorMessage
          ? (
              <div className="space-y-3">
                <p role="alert" className="text-sm text-destructive">{errorMessage}</p>
                <TranslationRetry onRetry={target => void retry(target)} disabled={isLoading} />
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
