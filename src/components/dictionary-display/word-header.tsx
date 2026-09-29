interface WordHeaderProps {
  word?: string
  pronunciation?: string
}

function WordHeader({ word, pronunciation }: WordHeaderProps) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="text-2xl font-semibold tracking-tight text-balance text-foreground">{word}</h2>
      {pronunciation && (
        <p className="font-mono text-sm text-muted-foreground">
          <span className="mr-1.5 font-sans text-xs font-medium tracking-wide">美音</span>
          [
          {pronunciation}
          ]
        </p>
      )}
    </div>
  )
}

export default WordHeader
