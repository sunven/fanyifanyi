import type { DictionaryPhrase } from '@/lib/dictionary'

interface PhrasesTabProps {
  phrases: DictionaryPhrase[]
}

function PhrasesTab({ phrases }: PhrasesTabProps) {
  if (!phrases.length) {
    return <p className="py-6 text-sm leading-relaxed text-muted-foreground">没有常用短语。</p>
  }

  return (
    <ul className="divide-y divide-border">
      {phrases.map(item => (
        <li key={`${item.phrase}:${item.translation}`} className="py-2.5">
          <p className="text-sm font-medium text-foreground">{item.phrase}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.translation}</p>
        </li>
      ))}
    </ul>
  )
}

export default PhrasesTab
