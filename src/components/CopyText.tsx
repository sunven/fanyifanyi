import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { useTimeoutFn } from 'react-use'
import { Button } from '@/components/ui/button'

export default function CopyTextButton({ text }: { text: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const [, , reset] = useTimeoutFn(() => setStatus('idle'), 2000)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setStatus('copied')
    }
    catch {
      setStatus('error')
    }
    reset()
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => void handleCopy()}
      disabled={!text}
    >
      {status === 'copied' ? <Check /> : <Copy />}
      <span className="text-xs" aria-live="polite">
        {status === 'copied' ? '已复制' : status === 'error' ? '复制失败' : '复制'}
      </span>
    </Button>
  )
}
