import type { TranslationTarget } from '@/lib/config'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { loadTranslationTargets } from '@/lib/config'

interface TranslationRetryProps {
  onRetry: (target?: TranslationTarget) => void
  disabled?: boolean
}

export default function TranslationRetry({ onRetry, disabled }: TranslationRetryProps) {
  const [targets, setTargets] = useState<Awaited<ReturnType<typeof loadTranslationTargets>>>([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let disposed = false
    loadTranslationTargets().then((items) => {
      if (!disposed)
        setTargets(items)
    }).catch(() => {
      if (!disposed)
        setError('无法读取备用引擎，请在设置中检查配置')
    })
    return () => {
      disposed = true
    }
  }, [])

  return (
    <div className="not-prose flex flex-wrap items-center gap-2 text-sm">
      <Button size="sm" variant="outline" onClick={() => onRetry()} disabled={disabled}>重试</Button>
      <select
        aria-label="备用翻译引擎"
        value={selected}
        onChange={event => setSelected(event.target.value)}
        disabled={disabled}
        className="h-8 max-w-full rounded-md border bg-background px-2 text-foreground"
      >
        <option value="">选择备用引擎</option>
        {targets.map(({ target, label }, index) => (
          <option key={`${target.provider}:${target.modelId ?? ''}`} value={index}>{label}</option>
        ))}
      </select>
      <Button size="sm" onClick={() => onRetry(targets[Number(selected)]?.target)} disabled={disabled || selected === ''}>
        使用此引擎重试
      </Button>
      {error && <p className="w-full text-xs">{error}</p>}
    </div>
  )
}
