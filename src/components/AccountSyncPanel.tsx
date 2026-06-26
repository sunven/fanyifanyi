import type { AIConfigs } from '@/lib/config'
import type { SyncDatabaseStatus, SyncRow } from '@/lib/sync-service'
import { Cloud, Database, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getErrorMessage } from '@/lib/error-message'
import {
  clearSyncDatabaseUrl,
  downloadConfig,
  fetchRemoteConfig,
  getSyncDatabaseStatus,
  missingSyncDatabaseMessage,
  previewDatabaseUrl,
  saveSyncDatabaseUrl,
  uploadConfig,
} from '@/lib/sync-service'

type SyncStatus = 'idle' | 'checking' | 'syncing' | 'synced' | 'error'

type RemoteRefreshResult
  = | { ok: true, configured: true, row: SyncRow | null }
    | { ok: true, configured: false, row: null }
    | { ok: false }

interface AccountSyncPanelProps {
  configs: AIConfigs
  onImportConfig: (configs: AIConfigs) => Promise<void>
}

function formatDate(value?: string | null) {
  if (!value) {
    return '尚未同步'
  }
  return new Date(value).toLocaleString()
}

function getConfigSignature(configs: AIConfigs) {
  return JSON.stringify(configs)
}

export function AccountSyncPanel({ configs, onImportConfig }: AccountSyncPanelProps) {
  const [databaseStatus, setDatabaseStatus] = useState<SyncDatabaseStatus>({
    configured: false,
    preview: null,
  })
  const [databaseUrlInput, setDatabaseUrlInput] = useState('')
  const [acceptInvalidTls, setAcceptInvalidTls] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('checking')
  const [remoteRow, setRemoteRow] = useState<SyncRow | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [hasResolvedInitialSync, setHasResolvedInitialSync] = useState(false)
  const lastSyncedConfigSignatureRef = useRef<string | null>(null)
  const configsRef = useRef(configs)
  const initialSyncRef = useRef<Promise<void> | null>(null)

  useEffect(() => {
    configsRef.current = configs
  }, [configs])

  const inputPreview = useMemo(() => previewDatabaseUrl(databaseUrlInput), [databaseUrlInput])

  const refreshRemote = useCallback(async (): Promise<RemoteRefreshResult> => {
    setSyncStatus('checking')
    try {
      const status = await getSyncDatabaseStatus()
      setDatabaseStatus(status)
      if (!status.configured) {
        setRemoteRow(null)
        setLastSyncedAt(null)
        setSyncStatus('idle')
        return { ok: true, configured: false, row: null }
      }

      const row = await fetchRemoteConfig()
      setRemoteRow(row)
      setLastSyncedAt(row?.updated_at ?? null)
      setSyncStatus('idle')
      return { ok: true, configured: true, row }
    }
    catch (error) {
      setErrorMessage(getErrorMessage(error))
      setSyncStatus('error')
      return { ok: false }
    }
  }, [])

  const syncFromRemote = useCallback(async (row: SyncRow) => {
    const payload = downloadConfig(row)
    await onImportConfig({
      activeModelId: payload.activeModelId,
      translationProvider: payload.translationProvider,
      models: payload.models,
    })
    lastSyncedConfigSignatureRef.current = getConfigSignature({
      activeModelId: payload.activeModelId,
      translationProvider: payload.translationProvider,
      models: payload.models,
    })
    setHasResolvedInitialSync(true)
    setLastSyncedAt(payload.updatedAt)
    setSyncStatus('synced')
  }, [onImportConfig])

  const uploadCurrentConfig = useCallback(async (configsToUpload = configsRef.current) => {
    const payload = await uploadConfig(configsToUpload)
    lastSyncedConfigSignatureRef.current = getConfigSignature(configsToUpload)
    setRemoteRow({
      schema_version: payload.schemaVersion,
      revision: payload.revision,
      updated_at: payload.updatedAt,
      device_id: payload.deviceId,
      plaintext: payload,
    })
    setHasResolvedInitialSync(true)
    setLastSyncedAt(payload.updatedAt)
    setSyncStatus('synced')
  }, [])

  const resolveInitialSync = useCallback(async () => {
    if (initialSyncRef.current) {
      return initialSyncRef.current
    }

    initialSyncRef.current = (async () => {
      const result = await refreshRemote()
      if (!result.ok || !result.configured) {
        setHasResolvedInitialSync(false)
        return
      }
      if (result.row?.plaintext) {
        await syncFromRemote(result.row)
        return
      }
      await uploadCurrentConfig()
    })().finally(() => {
      initialSyncRef.current = null
    })

    return initialSyncRef.current
  }, [refreshRemote, syncFromRemote, uploadCurrentConfig])

  const resolveConfiguredInitialSync = useCallback(async () => {
    setSyncStatus('checking')
    try {
      const row = await fetchRemoteConfig()
      setRemoteRow(row)
      setLastSyncedAt(row?.updated_at ?? null)
      if (row?.plaintext) {
        await syncFromRemote(row)
        return
      }
      await uploadCurrentConfig()
    }
    catch (error) {
      setHasResolvedInitialSync(false)
      setErrorMessage(getErrorMessage(error))
      setSyncStatus('error')
    }
  }, [syncFromRemote, uploadCurrentConfig])

  useEffect(() => {
    void resolveInitialSync()
  }, [resolveInitialSync])

  const handleSaveDatabaseUrl = async () => {
    setErrorMessage('')
    setSyncStatus('checking')
    try {
      const status = await saveSyncDatabaseUrl(databaseUrlInput, { acceptInvalidTls })
      setDatabaseStatus(status)
      setDatabaseUrlInput('')
      setAcceptInvalidTls(false)
      await resolveConfiguredInitialSync()
    }
    catch (error) {
      setErrorMessage(getErrorMessage(error))
      setSyncStatus('error')
    }
  }

  const handleClearDatabaseUrl = async () => {
    setErrorMessage('')
    setSyncStatus('checking')
    try {
      await clearSyncDatabaseUrl()
      setDatabaseStatus({ configured: false, preview: null })
      setRemoteRow(null)
      setLastSyncedAt(null)
      setHasResolvedInitialSync(false)
      lastSyncedConfigSignatureRef.current = null
      setSyncStatus('idle')
    }
    catch (error) {
      setErrorMessage(getErrorMessage(error))
      setSyncStatus('error')
    }
  }

  const handleUpload = async () => {
    setErrorMessage('')
    setSyncStatus('syncing')
    try {
      await uploadCurrentConfig(configs)
    }
    catch (error) {
      setErrorMessage(getErrorMessage(error))
      setSyncStatus('error')
    }
  }

  useEffect(() => {
    if (!databaseStatus.configured || syncStatus === 'checking' || syncStatus === 'syncing') {
      return
    }
    if (!hasResolvedInitialSync) {
      return
    }
    const currentSignature = getConfigSignature(configs)
    if (currentSignature === lastSyncedConfigSignatureRef.current) {
      return
    }

    const timer = window.setTimeout(() => {
      setErrorMessage('')
      setSyncStatus('syncing')
      void uploadCurrentConfig(configs).catch((error) => {
        setErrorMessage(getErrorMessage(error))
        setSyncStatus('error')
      })
    }, 800)

    return () => window.clearTimeout(timer)
  }, [configs, databaseStatus.configured, hasResolvedInitialSync, syncStatus, uploadCurrentConfig])

  const statusLabel = syncStatus === 'checking'
    ? '检查中'
    : syncStatus === 'syncing'
      ? '同步中'
      : syncStatus === 'synced'
        ? '已同步'
        : syncStatus === 'error'
          ? '需要处理'
          : databaseStatus.configured
            ? '已连接'
            : '未连接'

  return (
    <section className="p-2">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl font-bold">同步</h2>
            <Badge variant={syncStatus === 'error' ? 'destructive' : 'secondary'}>{statusLabel}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            使用你自己的 Supabase 数据库连接池 URL 同步 AI 配置。URL 保存在系统安全存储中，不会显示密码。
          </p>
          <p className="text-xs text-muted-foreground">
            推荐复制 Supabase Dashboard 的 Session pooler URI（通常端口 5432）；Transaction pooler 通常是 6543，也可以连接。
          </p>
          <p className="text-xs text-muted-foreground">
            如果保存时报 UnknownIssuer，推荐下载 Supabase Server root certificate 并追加 sslrootcert；也可临时跳过证书校验。
          </p>
          <p className="text-sm text-muted-foreground">
            上次同步：
            {' '}
            {formatDate(lastSyncedAt)}
          </p>
          {databaseStatus.preview && (
            <p className="flex items-center gap-2 text-sm">
              <Database className="h-4 w-4 text-muted-foreground" />
              <span className="min-w-0 truncate font-medium">{databaseStatus.preview}</span>
            </p>
          )}
          {remoteRow && (
            <p className="text-xs text-muted-foreground">
              云端版本：
              {' '}
              {remoteRow.revision}
            </p>
          )}
          {!databaseStatus.configured && (
            <p className="text-sm text-amber-600 dark:text-amber-400" role="alert">
              {missingSyncDatabaseMessage}
              。
            </p>
          )}
          {errorMessage && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {errorMessage}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 md:min-w-96">
          <label className="space-y-1 text-sm font-medium">
            <span>Supabase 连接池 URL</span>
            <Input
              type="password"
              autoComplete="off"
              value={databaseUrlInput}
              onChange={event => setDatabaseUrlInput(event.target.value)}
              placeholder="postgresql://postgres.xxx:password@...pooler.supabase.com:5432/postgres"
              aria-label="Supabase 连接池 URL"
            />
          </label>
          {inputPreview && (
            <p className="truncate text-xs text-muted-foreground">
              预览：
              {' '}
              {inputPreview}
            </p>
          )}
          <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <input
              type="checkbox"
              checked={acceptInvalidTls}
              onChange={event => setAcceptInvalidTls(event.target.checked)}
              className="mt-0.5 size-4 shrink-0"
              aria-label="跳过数据库证书校验"
            />
            <span className="min-w-0">
              <span className="inline-flex items-center gap-1 font-medium">
                <ShieldAlert className="h-3.5 w-3.5" />
                跳过证书校验
              </span>
              <span className="block">仅在 UnknownIssuer 时使用。仍使用 TLS 加密，但无法确认服务器身份。</span>
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={handleSaveDatabaseUrl} disabled={!databaseUrlInput.trim() || syncStatus === 'checking'}>
              保存连接
            </Button>
            <Button size="sm" variant="outline" onClick={refreshRemote} disabled={syncStatus === 'checking'}>
              刷新状态
            </Button>
            <Button size="sm" onClick={handleUpload} disabled={!databaseStatus.configured || syncStatus === 'syncing'} className="col-span-2">
              <RefreshCw className="h-4 w-4" />
              立即同步
            </Button>
            {databaseStatus.configured && (
              <Button size="sm" variant="ghost" onClick={handleClearDatabaseUrl} className="col-span-2">
                <Trash2 className="h-4 w-4" />
                清除连接
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
