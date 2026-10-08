import type { HistorySnapshot, TranslationRecord } from '@/lib/history'
import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { ArrowLeft, Check, Copy, History as HistoryIcon, Search, Star, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NonMacOnly, TitleBarSpacer, WindowTitleBar } from '@/components/WindowTitleBar'
import { deleteHistoryEntry, loadHistory, setHistoryFavorite } from '@/lib/history'
import { cn } from '@/lib/utils'

function engineName(record: TranslationRecord) {
  if (record.engine.provider === 'ai') {
    return record.engine.modelName || 'AI 翻译'
  }
  return record.engine.provider === 'google' ? 'Google 翻译' : 'Microsoft 翻译'
}

export default function History({ onBack }: { onBack: () => void }) {
  const [snapshot, setSnapshot] = useState<HistorySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const requests = useRef({ active: false, version: 0, updating: false, refreshPending: false })
  const visibleSelection = useRef<string | null>(null)

  const refreshHistory = useCallback(async () => {
    if (requests.current.updating) {
      requests.current.refreshPending = true
      return
    }
    const version = ++requests.current.version
    try {
      const history = await loadHistory()
      if (requests.current.active && version === requests.current.version) {
        setSnapshot(history)
        setSelectedId(visibleSelection.current ?? history.entries[0]?.id ?? null)
        setError('')
      }
    }
    catch {
      if (requests.current.active && version === requests.current.version) {
        setError('读取翻译历史失败，请重试')
      }
    }
    finally {
      if (requests.current.active && version === requests.current.version) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let stopListening: (() => void) | undefined
    const requestState = requests.current
    requestState.active = true
    void refreshHistory()
    if (isTauri()) {
      void listen('translation-history-changed', () => {
        if (!cancelled) {
          void refreshHistory()
        }
      }).then((unlisten) => {
        if (cancelled) {
          unlisten()
        }
        else {
          stopListening = unlisten
        }
      }).catch(() => {
        if (!cancelled) {
          setError('监听历史更新失败，请重新打开历史页')
        }
      })
    }
    return () => {
      cancelled = true
      requestState.active = false
      requestState.version++
      stopListening?.()
    }
  }, [refreshHistory])

  const search = query.trim().toLocaleLowerCase()
  const entries = (snapshot?.entries ?? []).filter(record => (
    (!favoritesOnly || record.favorite)
    && (!search || record.sourceText.toLocaleLowerCase().includes(search) || record.translatedText.toLocaleLowerCase().includes(search))
  ))
  const selected = entries.find(record => record.id === selectedId) ?? entries[0]

  useEffect(() => {
    visibleSelection.current = selected?.id ?? null
  }, [selected?.id])

  const updateHistory = async (operation: () => Promise<HistorySnapshot>, failureMessage: string) => {
    requests.current.updating = true
    requests.current.version++
    setBusy(true)
    setError('')
    setCopied('')
    try {
      setSnapshot(await operation())
    }
    catch {
      setError(failureMessage)
    }
    finally {
      requests.current.updating = false
      setBusy(false)
      if (requests.current.active && requests.current.refreshPending) {
        requests.current.refreshPending = false
        void refreshHistory()
      }
    }
  }

  const copyText = async (text: string, label: string) => {
    setError('')
    setCopied('')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(`${label}已复制`)
    }
    catch {
      setError('复制失败，请重试')
    }
  }

  const backButton = (
    <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-2 text-xs" aria-label="返回">
      <ArrowLeft className="h-4 w-4" />
      返回
    </Button>
  )

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <WindowTitleBar title="翻译历史">{backButton}</WindowTitleBar>
      <TitleBarSpacer />
      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-3 p-4">
        <NonMacOnly>
          <div className="flex items-center gap-3">
            {backButton}
            <h1 className="text-xl font-semibold tracking-tight">翻译历史</h1>
          </div>
        </NonMacOnly>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-40 flex-1">
            <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input aria-label="搜索翻译历史" placeholder="搜索原文或译文" value={query} onChange={event => setQuery(event.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-1" aria-label="历史筛选">
            <Button size="sm" variant={favoritesOnly ? 'ghost' : 'secondary'} aria-pressed={!favoritesOnly} onClick={() => setFavoritesOnly(false)}>全部</Button>
            <Button size="sm" variant={favoritesOnly ? 'secondary' : 'ghost'} aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(true)}>
              <Star className="h-4 w-4" />
              收藏
            </Button>
          </div>
        </div>
        {error && (
          <div className="flex flex-wrap items-center gap-2">
            <p role="alert" className="text-sm text-destructive">{error}</p>
            {!snapshot && <Button size="sm" variant="outline" disabled={busy} onClick={() => void updateHistory(loadHistory, '读取翻译历史失败，请重试')}>重新加载</Button>}
          </div>
        )}
        {copied && <p role="status" className="text-xs text-muted-foreground">{copied}</p>}
        {loading
          ? <p role="status" className="py-12 text-center text-sm text-muted-foreground">正在加载历史...</p>
          : snapshot && entries.length === 0
            ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
                  <HistoryIcon className="h-8 w-8" />
                  <p className="text-sm">{search ? '没有匹配的翻译记录' : favoritesOnly ? '暂无收藏' : '暂无翻译历史'}</p>
                  {!search && !favoritesOnly && <p className="text-xs">{snapshot.enabled ? '完成翻译后，记录会自动保存在这里。' : '自动保存已关闭，可在设置中开启。'}</p>}
                </div>
              )
            : selected && (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border md:flex-row">
                <nav aria-label="翻译记录" className="max-h-[min(11rem,35%)] shrink-0 overflow-y-auto border-b md:max-h-none md:w-72 md:border-r md:border-b-0">
                  {entries.map(record => (
                    <button
                      key={record.id}
                      type="button"
                      aria-current={record.id === selected.id ? 'true' : undefined}
                      onClick={() => {
                        setSelectedId(record.id)
                        setCopied('')
                      }}
                      className={cn('block w-full border-b p-3 text-left last:border-b-0 hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2', record.id === selected.id && 'bg-muted')}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{record.kind === 'desk' ? '工作台翻译' : '截图翻译'}</span>
                        {record.favorite && <Star aria-label="已收藏" className="h-3.5 w-3.5 fill-current text-amber-500" />}
                      </div>
                      <p className="line-clamp-2 break-words text-sm font-medium">{record.sourceText}</p>
                      <p className="mt-1 line-clamp-1 break-words text-xs text-muted-foreground">{record.translatedText}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{new Date(record.completedAt).toLocaleString()}</p>
                    </button>
                  ))}
                </nav>
                <section aria-label="翻译详情" className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
                  <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1 text-xs text-muted-foreground">
                      <p className="break-words">{engineName(selected)}</p>
                      <p>{new Date(selected.completedAt).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void updateHistory(() => setHistoryFavorite(selected.id, !selected.favorite), '保存收藏失败，请重试')}>
                        <Star className={cn('h-4 w-4', selected.favorite && 'fill-current text-amber-500')} />
                        {selected.favorite ? '取消收藏' : '收藏此条'}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void updateHistory(() => deleteHistoryEntry(selected.id), '删除记录失败，请重试')} aria-label="删除记录">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-6">
                    {([{ label: '原文', text: selected.sourceText }, { label: '译文', text: selected.translatedText }]).map(({ label, text }) => (
                      <div key={label}>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
                          <Button variant="ghost" size="sm" onClick={() => void copyText(text, label)} aria-label={`复制${label}`}>
                            {copied === `${label}已复制` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            复制
                          </Button>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{text}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
      </main>
    </div>
  )
}
