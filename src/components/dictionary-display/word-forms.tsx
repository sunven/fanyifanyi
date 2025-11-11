interface WordFormsProps {
  wordForms?: any[]
}

function WordForms({ wordForms }: WordFormsProps) {
  return (
    <div className="mt-2 pt-2 border-t border-gray-200">
      <div className="flex flex-wrap gap-2  text-xs">
        {wordForms?.map((form, index) => (
          <div key={index} className="bg-gray-100 p-2 rounded-md">
            <span className="text-gray-600">
              {form.wf.name}
              :
            </span>
            <span className="font-medium text-gray-800 ml-2">{form.wf.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default WordForms
