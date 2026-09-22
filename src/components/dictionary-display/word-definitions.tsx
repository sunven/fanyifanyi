interface WordDefinitionsProps {
  data: any[]
}

function WordDefinitions({ data }: WordDefinitionsProps) {
  if (!data?.length) {
    return <p className="py-6 text-sm leading-relaxed text-muted-foreground">没有找到释义。</p>
  }

  return (
    <div className="space-y-4 py-2">
      {data.map((def, index) => {
        const definition = def.tr[0].l.i[0]
        const pos = definition.indexOf(' ')
        const partOfSpeech = definition.slice(0, pos)
        const meaning = definition.slice(pos + 1)

        return (
          <div key={index} className="border-l-2 border-primary/40 pl-3">
            <h3 className="mb-1 text-xs font-medium tracking-wide text-primary">
              {partOfSpeech}
            </h3>
            <p className="text-sm leading-relaxed text-foreground">{meaning}</p>
          </div>
        )
      })}
    </div>
  )
}

export default WordDefinitions
