import type { DictionaryEntry } from '@/lib/dictionary'
import { invoke } from '@tauri-apps/api/core'
import { useState } from 'react'
import { useDebounce } from 'react-use'
import { readDictionaryEntry } from '@/lib/dictionary'
import TabNavigation from './tab-navigation'
import WordForms from './word-forms'
import WordHeader from './word-header'

interface DictionaryDisplayProps {
  q: string
}

function DictionarySkeleton() {
  return (
    <div className="space-y-3 pt-4" aria-hidden="true">
      <div className="h-3 w-1/3 animate-pulse rounded-sm bg-muted" />
      <div className="h-3 w-full animate-pulse rounded-sm bg-muted" />
      <div className="h-3 w-5/6 animate-pulse rounded-sm bg-muted" />
      <div className="h-3 w-2/3 animate-pulse rounded-sm bg-muted" />
    </div>
  )
}

function DictionaryDisplay({ q }: DictionaryDisplayProps) {
  const [activeTab, setActiveTab] = useState('definitions')
  const [entry, setEntry] = useState<DictionaryEntry | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState('')
  const hasQuery = q.trim().length > 0
  const viewStatus = hasQuery ? status : 'idle'

  const getDictData = async () => {
    if (!q.trim()) {
      return
    }
    setActiveTab('definitions')
    setEntry(null)
    setStatus('loading')
    setError('')
    try {
      const next = await invoke('get_dict_data', { q })
      setEntry(readDictionaryEntry(next, q))
      setStatus('ready')
    }
    catch (err) {
      setEntry(null)
      setStatus('error')
      const message = typeof err === 'string' ? err.trim() : ''
      setError(message || '词典查询失败。请再试一次。')
    }
  }

  useDebounce(getDictData, 1000, [q])

  if (!q.trim()) {
    return (
      <div className="flex h-full items-start p-4">
        <p className="max-w-[36ch] text-sm leading-relaxed text-pretty text-muted-foreground">
          输入单词后，释义、短语和同义词会显示在这里。
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <div className="shrink-0">
        <WordHeader
          word={q}
          pronunciation={entry?.pronunciation}
        />
        <WordForms forms={entry?.forms ?? []} />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {viewStatus === 'loading' && (
          <div aria-live="polite">
            <p className="sr-only">正在查询词典</p>
            <DictionarySkeleton />
          </div>
        )}
        {viewStatus === 'error' && (
          <p role="alert" className="pt-4 text-sm text-destructive">{error}</p>
        )}
        {viewStatus === 'ready' && !entry && (
          <p className="pt-4 text-sm leading-relaxed text-muted-foreground">没有收录这个词。</p>
        )}
        {viewStatus === 'ready' && entry && (
          <TabNavigation
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            senses={entry.senses}
            phrases={entry.phrases}
            synonyms={entry.synonyms}
            relatedWords={entry.relatedWords}
          />
        )}
      </div>
    </div>
  )
}

export default DictionaryDisplay
