import { StopCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { useDebounce } from 'react-use'
import { Streamdown } from 'streamdown'
import CopyTextButton from '@/components/CopyText'
import { translateStream } from '@/lib/ai'
import { logger } from '@/lib/logger'

interface TranslateDisplayProps {
  q: string
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

export default function TranslateDisplay({ q }: TranslateDisplayProps) {
  const [translatedText, setTranslatedText] = useState('')
  const [error, setError] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const translateText = async () => {
    if (!q) {
      setTranslatedText('')
      setError('')
      setIsStreaming(false)
      // 取消之前的翻译
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      return
    }

    // 取消之前的翻译
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController()

    setIsStreaming(true)
    setError('')
    setTranslatedText('')
    try {
      for await (const chunk of translateStream(q, abortControllerRef.current.signal)) {
        // 如果已取消，退出循环
        if (abortControllerRef.current.signal.aborted) {
          break
        }
        setTranslatedText(prev => prev + chunk)
      }
    }
    catch (error) {
      // 如果是 AbortError，忽略它
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
      logger.error('翻译失败', error)
      setError('翻译失败。请检查模型配置和网络后再试。')
    }
    finally {
      setIsStreaming(false)
    }
  }

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsStreaming(false)
    }
  }

  useDebounce(translateText, 1000, [q],
  )

  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium tracking-wide text-muted-foreground">翻译结果</label>
        <div className="flex items-center gap-1">
          <CopyTextButton text={translatedText} />
          {isStreaming && (
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
      <div className="prose prose-neutral dark:prose-invert max-w-none flex-1 overflow-y-auto pr-2 break-words prose-p:leading-relaxed prose-headings:tracking-tight">
        {!q && !translatedText && !error
          ? (
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                输入原文。停顿片刻后，译文会出现在这里。
              </p>
            )
          : null}
        {error
          ? <p role="alert" className="text-sm text-destructive">{error}</p>
          : null}
        {isStreaming && !translatedText
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
                isAnimating={isStreaming}
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
