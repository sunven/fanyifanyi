interface PhrasesTabProps {
  data: any[]
}

function PhrasesTab({ data }: PhrasesTabProps) {
  if (!data?.length) {
    return <p className="py-6 text-sm leading-relaxed text-muted-foreground">没有常用短语。</p>
  }

  return (
    <ul className="divide-y divide-border">
      {data.map((item, index) => {
        const phrase = item.phr.headword.l.i
        const translation = item.phr.trs[0].tr.l.i

        return (
          <li key={index} className="py-2.5">
            <p className="text-sm font-medium text-foreground">{phrase}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{translation}</p>
          </li>
        )
      })}
    </ul>
  )
}

export default PhrasesTab
