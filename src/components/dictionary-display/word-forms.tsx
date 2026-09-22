interface WordFormsProps {
  wordForms?: any[]
}

function WordForms({ wordForms }: WordFormsProps) {
  if (!wordForms?.length) {
    return null
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap gap-1.5 text-xs">
        {wordForms.map((form, index) => (
          <div key={index} className="rounded-sm bg-muted px-2 py-1">
            <span className="text-muted-foreground">
              {form.wf.name}
              :
            </span>
            <span className="ml-1.5 font-medium text-foreground">{form.wf.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default WordForms
