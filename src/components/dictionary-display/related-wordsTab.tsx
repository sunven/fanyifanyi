interface RelatedWordsTabProps {
  data: any[]
}

function RelatedWordsTab({ data }: RelatedWordsTabProps) {
  if (!data?.length) {
    return <p className="py-6 text-sm leading-relaxed text-muted-foreground">没有相关词汇。</p>
  }

  return (
    <div className="space-y-5 py-2">
      {data.map((item, index) => {
        const pos = item.rel.pos
        const words = item.rel.words

        return (
          <section key={index}>
            <h4 className="mb-2 text-xs font-medium tracking-wide text-primary">
              {pos}
            </h4>
            <ul className="space-y-2">
              {words.map((wordObj: any, wordIndex: number) => (
                <li key={wordIndex} className="rounded-sm bg-muted/70 px-2.5 py-2">
                  <p className="text-sm font-medium text-foreground">{wordObj.word}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{wordObj.tran}</p>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

export default RelatedWordsTab
