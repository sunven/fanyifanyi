import type { DictionarySense } from '@/lib/dictionary'

interface WordDefinitionsProps {
  senses: DictionarySense[]
}

function WordDefinitions({ senses }: WordDefinitionsProps) {
  if (!senses.length) {
    return <p className="py-6 text-sm leading-relaxed text-muted-foreground">没有找到释义。</p>
  }

  return (
    <div className="space-y-4 py-2">
      {senses.map(sense => (
        <div key={`${sense.partOfSpeech}:${sense.meaning}`} className="border-l-2 border-primary/40 pl-3">
          <h3 className="mb-1 text-xs font-medium tracking-wide text-primary">
            {sense.partOfSpeech}
          </h3>
          <p className="text-sm leading-relaxed text-foreground">{sense.meaning}</p>
        </div>
      ))}
    </div>
  )
}

export default WordDefinitions
