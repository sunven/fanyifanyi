interface RelatedWordsTabProps {
  data: any[]
}

function RelatedWordsTab({ data }: RelatedWordsTabProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {data?.map((item, index) => {
        const pos = item.rel.pos
        const words = item.rel.words

        return (
          <div key={index} className="bg-gradient-to-b from-gray-50 to-indigo-50 p-2 rounded-md">
            <h4 className="font-semibold text-gray-700 mb-2 flex items-center">
              {pos}
            </h4>
            <div className="space-y-2">
              {words.map((wordObj: any, wordIndex: number) => (
                <div
                  key={wordIndex}
                  className="bg-white p-2 rounded-md border border-gray-200"
                >
                  <div className="font-medium text-gray-600 mb-1">
                    {wordObj.word}
                  </div>
                  <div className="text-xs text-gray-500">
                    {wordObj.tran}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default RelatedWordsTab
