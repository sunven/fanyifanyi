import { useDebounce } from "react-use";
import { translateStream } from "@/lib/ai";
import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { Streamdown } from "streamdown";

interface TranslateDisplayProps {
  q: string;
}

export default function TranslateDisplay({ q }: TranslateDisplayProps) {

  const [translatedText, setTranslatedText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)

  const translateText = async () => {
    if (!q) {
      setTranslatedText('')
      setIsStreaming(false)
      return;
    }
    setIsStreaming(true)
    setTranslatedText('')
    try {
      for await (const chunk of translateStream(q)) {
        setTranslatedText(prev => prev + chunk)
      }
    } finally {
      setIsStreaming(false)
    }
  }

  useDebounce(translateText,
    1000,
    [q]
  );

  return <div className="flex flex-col h-full space-y-2">
    <div className="flex justify-between items-center">
      <label className="text-sm font-medium">翻译结果</label>
    </div>
    <div className="flex-1 overflow-y-auto break-words prose dark:prose-invert max-w-none">
      {isStreaming && !translatedText ? (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <Spinner className="mr-2" />
          <span>翻译中...</span>
        </div>
      ) : (
        <Streamdown
          isAnimating={isStreaming}
          controls={true}
        >
          {translatedText}
        </Streamdown>
      )}
    </div>
  </div>
}