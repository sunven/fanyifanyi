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
    { id: 'definitions', label: '释义' },
    { id: 'phrases', label: '短语' },
    { id: 'synonyms', label: '同义词' },
    { id: 'related', label: '相关词汇' },
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
        return <p className="py-6 text-sm text-muted-foreground">没有内容。</p>
    }
  }

  return (
    <div className="flex h-full flex-col pt-3">
      <div className="mb-2 flex shrink-0 flex-wrap border-b border-border" role="tablist">
        {tabs.map(tab => (
          <button
            type="button"
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-2.5 py-2 text-xs font-medium tracking-wide transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${activeTab === tab.id
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-content min-h-0 flex-1 overflow-y-auto">
        {renderTabContent()}
      </div>
    </div>
  )
}

export default TabNavigation
