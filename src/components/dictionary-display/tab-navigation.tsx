import PhrasesTab from './phrases-tab'
import RelatedWordsTab from './related-wordsTab'
import SynonymsTab from './synonyms-tab'
import WordDefinitions from './word-definitions'

interface TabNavigationProps {
  activeTab: string
  setActiveTab: (tab: string) => void
  definitionsData: any[]
  phrasesData: any[]
  synonymsData: any[]
  relatedWordsData: any[]
}
function TabNavigation({ activeTab, setActiveTab, definitionsData, phrasesData, synonymsData, relatedWordsData }: TabNavigationProps) {
  const tabs = [
    {
      id: 'definitions',
      label: '释义',
    },
    {
      id: 'phrases',
      label: '短语',
    },
    {
      id: 'synonyms',
      label: '同义词',
    },
    {
      id: 'related',
      label: '相关词汇',
    },
  ]

  const renderTabContent = () => {
    switch (activeTab) {
      case 'definitions':
        return <WordDefinitions data={definitionsData} />
      case 'phrases':
        return <PhrasesTab data={phrasesData} />
      case 'synonyms':
        return <SynonymsTab data={synonymsData} />
      case 'related':
        return <RelatedWordsTab data={relatedWordsData} />
      default:
        return <div>Empty Tab</div>
    }
  }

  return (
    <div className="bg-white rounded-md p-2 h-full flex flex-col">
      {/* Tab Headers */}
      <div className="flex flex-wrap border-b border-gray-200 mb-2 flex-shrink-0">
        {tabs.map(tab => (
          <button
            type="button"
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`p-2 text-xs font-medium transition-colors duration-200 border-b-2 ${activeTab === tab.id
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-500 hover:text-gray-700 border-transparent hover:border-gray-300'
            }`}
          >
            {/* {tab.icon} */}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="tab-content flex-1 overflow-y-auto">
        {renderTabContent()}
      </div>
    </div>
  )
}

export default TabNavigation
