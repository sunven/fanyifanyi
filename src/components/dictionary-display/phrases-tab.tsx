interface PhrasesTabProps {
  data: any[]
}

function PhrasesTab({ data }: PhrasesTabProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
      {data?.map((item, index) => {
        const phrase = item.phr.headword.l.i
        const translation = item.phr.trs[0].tr.l.i

        return (
          <div
            key={index}
            className={`bg-gradient-to-r from-gray-50 to-gray-100 p-2 rounded-md `}
          >
            <div className="text-sm font-semibold text-gray-800">
              {phrase}
            </div>
            <div className="text-xs text-gray-600">
              {translation}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default PhrasesTab
