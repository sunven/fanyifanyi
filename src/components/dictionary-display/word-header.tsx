interface WordHeaderProps {
  word?: string
  examTypes?: string[]
  usphone?: string
}

// function getExamTypeColor(type: string) {
//   const colors: Record<string, string> = {
//     初中: 'bg-blue-100 text-blue-800',
//     高中: 'bg-green-100 text-green-800',
//     CET4: 'bg-purple-100 text-purple-800',
//     CET6: 'bg-orange-100 text-orange-800',
//     考研: 'bg-red-100 text-red-800',
//   }
//   return colors[type] || 'bg-gray-100 text-gray-800'
// }

function WordHeader({ word, usphone }: WordHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold text-gray-800">{word}</h2>
        {/* Pronunciation */}
        <div className="flex items-center space-x-2">
          <span className="text-gray-600 font-medium">美音:</span>
          <span className="font-mono text-gray-800">
            [
            {usphone}
            ]
          </span>
        </div>
      </div>

      {/* <div className="flex flex-wrap gap-2">
        {examTypes?.map((type, index) => (
          <span
            key={index}
            className={`px-2 py-1 rounded-md text-xs font-medium ${getExamTypeColor(type)}`}
          >
            {type}
          </span>
        ))}
      </div> */}
    </div>

  )
}

export default WordHeader
