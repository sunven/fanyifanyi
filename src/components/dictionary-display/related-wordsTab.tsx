import type { DictionaryRelated } from '@/lib/dictionary'

interface RelatedWordsTabProps {
  relatedWords: DictionaryRelated[]
}

function RelatedWordsTab({ relatedWords }: RelatedWordsTabProps) {
  if (!relatedWords.length) {
    return <p className="py-6 text-sm leading-relaxed text-muted-foreground">没有相关词汇。</p>
  }

  return (
    <div className="space-y-5 py-2">
      {relatedWords.map(group => (
        <section key={`${group.partOfSpeech}:${group.words.map(word => word.word).join(',')}`}>
          <h4 className="mb-2 text-xs font-medium tracking-wide text-primary">
            {group.partOfSpeech}
          </h4>
          <ul className="space-y-2">
            {group.words.map(word => (
              <li key={`${word.word}:${word.translation}`} className="rounded-sm bg-muted/70 px-2.5 py-2">
                <p className="text-sm font-medium text-foreground">{word.word}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{word.translation}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default RelatedWordsTab
