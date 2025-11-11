import { invoke } from '@tauri-apps/api/core'
import { useState } from 'react'
import { useDebounce } from 'react-use'
import TabNavigation from './tab-navigation'
import WordForms from './word-forms'
import WordHeader from './word-header'

interface DictionaryDisplayProps {
  q: string
}

function DictionaryDisplay({ q }: DictionaryDisplayProps) {
  const [activeTab, setActiveTab] = useState('definitions')
  const [data, setData] = useState<any>()
  // 提取词汇数据
  const wordData = data?.ec?.word?.[0]

  const getDictData = async () => {
    if (!q) {
      return
    }
    setActiveTab('definitions')
    const data = await invoke<any>('get_dict_data', { q })
    setData(data)
  }

  // useEffect(() => {
  //   getDictData(q)
  // }, [q])

  useDebounce(getDictData, 1000, [q],
  )

  return (
    <div className="container mx-auto h-full flex flex-col overflow-hidden">
      {/* Word Card */}
      <div className="bg-white rounded-md p-2 flex-shrink-0">
        <WordHeader
          word={q}
          examTypes={data?.ec?.exam_type}
          usphone={wordData?.usphone}
        />
        <WordForms wordForms={wordData?.wfs} />
      </div>

      {/* Tab Navigation */}
      <div className="flex-1 overflow-hidden">
        <TabNavigation
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          definitionsData={wordData?.trs}
          phrasesData={data?.phrs?.phrs}
          synonymsData={data?.syno?.synos}
          relatedWordsData={data?.rel_word?.rels}
        />
      </div>
    </div>
  )
}

export default DictionaryDisplay
