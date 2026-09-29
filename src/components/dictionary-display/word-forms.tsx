import type { DictionaryForm } from '@/lib/dictionary'

interface WordFormsProps {
  forms: DictionaryForm[]
}

function WordForms({ forms }: WordFormsProps) {
  if (!forms.length) {
    return null
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap gap-1.5 text-xs">
        {forms.map(form => (
          <div key={`${form.name}:${form.value}`} className="rounded-sm bg-muted px-2 py-1">
            <span className="text-muted-foreground">
              {form.name}
              :
            </span>
            <span className="ml-1.5 font-medium text-foreground">{form.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default WordForms
