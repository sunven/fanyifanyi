import type { HistorySnapshot } from '@/lib/history'
import { History } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { clearHistory, loadHistory, setHistoryEnabled } from '@/lib/history'

export default function HistorySettings() {
  const [snapshot, setSnapshot] = useState<HistorySnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadHistory().then((history) => {
      if (!cancelled) {
        setSnapshot(history)
      }
    }).catch(() => {
      if (!cancelled) {
        setError('读取历史设置失败，请重试')
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const save = async (operation: () => Promise<HistorySnapshot>, successMessage: string) => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      setSnapshot(await operation())
      setMessage(successMessage)
      setShowClearConfirm(false)
    }
    catch {
      setError('保存历史设置失败，请重试')
    }
    finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4 p-2" aria-labelledby="history-settings-title">
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-primary" />
        <h2 id="history-settings-title" className="text-lg font-semibold tracking-tight">翻译历史</h2>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <label htmlFor="history-enabled" className="text-sm font-medium">自动保存翻译历史</label>
          <p className="text-sm text-muted-foreground">工作台和截图翻译完成后自动保存。关闭后不再保存新记录，已有记录不受影响。</p>
          <p className="text-xs text-muted-foreground">普通记录保留 30 天，最多 500 条；收藏长期保留。</p>
        </div>
        <input
          id="history-enabled"
          type="checkbox"
          role="switch"
          checked={snapshot?.enabled ?? true}
          disabled={!snapshot || busy}
          onChange={event => void save(() => setHistoryEnabled(event.target.checked), '历史设置已保存')}
          className="mt-1 h-4 w-4 shrink-0 accent-primary"
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={!snapshot || busy || !snapshot.entries.some(record => !record.favorite)}
        onClick={() => {
          setError('')
          setMessage('')
          setShowClearConfirm(true)
        }}
      >
        清空普通历史
      </Button>
      {!snapshot && !error && <p className="text-xs text-muted-foreground">正在加载历史设置...</p>}
      {error && !showClearConfirm && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空普通历史？</AlertDialogTitle>
            <AlertDialogDescription>将删除所有未收藏的翻译记录，收藏会保留。此操作无法撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault()
                void save(clearHistory, '普通历史已清空，收藏已保留')
              }}
            >
              {busy ? '清空中...' : '确认清空'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
