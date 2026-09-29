import type { DictionarySynonym } from '@/lib/dictionary'

interface SynonymsTabProps {
  synonyms: DictionarySynonym[]
}

function SynonymsTab({ synonyms }: SynonymsTabProps) {
  if (!synonyms.length) {
    return <p className="py-6 text-sm leading-relaxed text-muted-foreground">没有同义词。</p>
  }

  return (
    <div className="space-y-4 py-2">
      {synonyms.map(group => (
        <div key={`${group.partOfSpeech}:${group.translation}:${group.words.join(',')}`}>
          <h4 className="mb-2 flex items-baseline gap-2 text-sm font-medium text-foreground">
            <span className="text-xs tracking-wide text-primary">{group.partOfSpeech}</span>
            {group.translation}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {group.words.map(word => (
              <span
                key={word}
                className="rounded-sm bg-muted px-2 py-1 text-xs font-medium text-foreground"
              >
                {word}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default SynonymsTab
