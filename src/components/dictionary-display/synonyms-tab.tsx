interface SynonymsTabProps {
  data: any[]
}

function SynonymsTab({ data }: SynonymsTabProps) {
  if (!data?.length) {
    return <p className="py-6 text-sm leading-relaxed text-muted-foreground">没有同义词。</p>
  }

  return (
    <div className="space-y-4 py-2">
      {data.map((item, index) => {
        const pos = item.syno.pos
        const translation = item.syno.tran
        const words = item.syno.ws

        return (
          <div key={index}>
            <h4 className="mb-2 flex items-baseline gap-2 text-sm font-medium text-foreground">
              <span className="text-xs tracking-wide text-primary">{pos}</span>
              {translation}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {words.map((wordObj: any, wordIndex: number) => (
                <span
                  key={wordIndex}
                  className="rounded-sm bg-muted px-2 py-1 text-xs font-medium text-foreground"
                >
                  {wordObj.w}
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default SynonymsTab
