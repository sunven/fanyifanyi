import { StopCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { useDebounce } from 'react-use'
import { Streamdown } from 'streamdown'
import { Spinner } from '@/components/ui/spinner'
import { translateStream } from '@/lib/ai'
import { logger } from '@/lib/logger'

interface TranslateDisplayProps {
  q: string
}

export default function TranslateDisplay({ q }: TranslateDisplayProps) {
  const [translatedText, setTranslatedText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const translateText = async () => {
    if (!q) {
      setTranslatedText('')
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
      // 其他错误，先记录日志再抛出
      logger.error('翻译失败', error)
      throw error
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
    <div className="flex flex-col h-full space-y-2 p-2">
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium">翻译结果</label>
        {isStreaming && (
          <button
            type="button"
            onClick={handleStop}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            title="停止翻译"
          >
            <StopCircle size={18} className="animate-spin" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto break-words prose prose-sm dark:prose-invert max-w-none pr-2">
        {isStreaming && !translatedText
          ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <Spinner className="mr-2" />
                <span>翻译中...</span>
              </div>
            )
          : (
              <Streamdown
                isAnimating={isStreaming}
                controls={true}
              >
                {translatedText}
              </Streamdown>
            )}
      </div>
    </div>
  )
}
