import type { Session, User } from '@supabase/supabase-js'
import type { AIConfigs } from '@/lib/config'
import type { SyncRow } from '@/lib/sync-service'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Cloud, LogOut, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getErrorMessage } from '@/lib/error-message'
import {
  downloadConfig,
  fetchRemoteConfig,
  getCurrentUser,
  handleOAuthCallback,
  hasSupabaseConfig,
  missingSupabaseConfigMessage,
  signInWithGoogle,
  signOut,
  supabase,
  uploadConfig,
} from '@/lib/sync-service'

type SyncStatus = 'idle' | 'checking' | 'syncing' | 'synced' | 'error'

type RemoteRefreshResult
  = | { ok: true, currentUser: User | null, row: SyncRow | null }
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
  const [user, setUser] = useState<User | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('checking')
  const [remoteRow, setRemoteRow] = useState<SyncRow | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [hasResolvedInitialSync, setHasResolvedInitialSync] = useState(false)
  const lastSyncedConfigSignatureRef = useRef<string | null>(null)
  const configsRef = useRef(configs)
  const syncAfterLoginRef = useRef<Promise<void> | null>(null)

  useEffect(() => {
    configsRef.current = configs
  }, [configs])

  const refreshRemote = async (): Promise<RemoteRefreshResult> => {
    if (!supabase) {
      setSyncStatus('idle')
      return { ok: false }
    }

    setSyncStatus('checking')
    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)
      if (!currentUser) {
        setRemoteRow(null)
        setSyncStatus('idle')
        return { ok: true, currentUser: null, row: null }
      }
      const row = await fetchRemoteConfig()
      setRemoteRow(row)
      setLastSyncedAt(row?.updated_at ?? null)
      setSyncStatus('idle')
      return { ok: true, currentUser, row }
    }
    catch (error) {
      setErrorMessage(getErrorMessage(error))
      setSyncStatus('error')
      return { ok: false }
    }
  }

  const syncFromRemote = async (row: SyncRow) => {
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
  }

  const uploadCurrentConfig = async (configsToUpload = configsRef.current) => {
    const payload = await uploadConfig(configsToUpload)
    lastSyncedConfigSignatureRef.current = getConfigSignature(configsToUpload)
    setRemoteRow({
      user_id: user?.id ?? '',
      schema_version: payload.schemaVersion,
      revision: payload.revision,
      updated_at: payload.updatedAt,
      device_id: payload.deviceId,
      plaintext: payload,
    })
    setHasResolvedInitialSync(true)
    setLastSyncedAt(payload.updatedAt)
    setSyncStatus('synced')
  }

  const syncAfterLogin = async () => {
    if (syncAfterLoginRef.current) {
      return syncAfterLoginRef.current
    }

    syncAfterLoginRef.current = (async () => {
      const result = await refreshRemote()
      if (!result.ok) {
        setHasResolvedInitialSync(false)
        return
      }
      if (!result.currentUser) {
        setHasResolvedInitialSync(false)
        return
      }
      if (result.row?.plaintext) {
        await syncFromRemote(result.row)
        return
      }
      await uploadCurrentConfig()
    })().finally(() => {
      syncAfterLoginRef.current = null
    })

    return syncAfterLoginRef.current
  }

  useEffect(() => {
    void syncAfterLogin()

    if (!supabase) {
      return undefined
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      setUser(session?.user ?? null)
      if (!session?.user) {
        return
      }
      void syncAfterLogin()
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !isTauri()) {
      return undefined
    }

    let unlisten: (() => void) | undefined
    const processUrl = async (url: string) => {
      try {
        await handleOAuthCallback(url)
        await syncAfterLogin()
      }
      catch (error) {
        setErrorMessage(getErrorMessage(error))
        setSyncStatus('error')
      }
    }

    void getCurrent()
      .then((urls) => {
        urls?.forEach(url => void processUrl(url))
      })
      .catch(() => {})

    void onOpenUrl((urls) => {
      urls.forEach(url => void processUrl(url))
    }).then((fn) => {
      unlisten = fn
    })

    return () => {
      unlisten?.()
    }
  }, [])

  const handleSignIn = async () => {
    setErrorMessage('')
    setSyncStatus('checking')
    try {
      const url = await signInWithGoogle()
      if (isTauri()) {
        await openUrl(url)
      }
      else {
        window.location.href = url
      }
      setSyncStatus('idle')
    }
    catch (error) {
      setErrorMessage(getErrorMessage(error))
      setSyncStatus('error')
    }
  }

  const handleSignOut = async () => {
    setErrorMessage('')
    setSyncStatus('checking')
    try {
      await signOut()
      setUser(null)
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
    if (!user || syncStatus === 'checking' || syncStatus === 'syncing') {
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
  }, [configs, hasResolvedInitialSync, syncStatus, user])

  const statusLabel = syncStatus === 'checking'
    ? '检查中'
    : syncStatus === 'syncing'
      ? '同步中'
      : syncStatus === 'synced'
        ? '已同步'
        : syncStatus === 'error'
          ? '需要处理'
          : user
            ? '已登录'
            : '未登录'

  return (
    <section className="p-2">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl font-bold">账号与同步</h2>
            <Badge variant={syncStatus === 'error' ? 'destructive' : 'secondary'}>{statusLabel}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            登录后自动同步 AI 配置。云端数据由 Supabase Auth 和 RLS 限制为仅当前账号可访问。
          </p>
          <p className="text-sm text-muted-foreground">
            上次同步：
            {' '}
            {formatDate(lastSyncedAt)}
          </p>
          {user?.email && (
            <p className="text-sm">
              当前账号：
              {' '}
              <span className="font-medium">{user.email}</span>
            </p>
          )}
          {remoteRow && (
            <p className="text-xs text-muted-foreground">
              云端版本：
              {' '}
              {remoteRow.revision}
            </p>
          )}
          {!hasSupabaseConfig && (
            <p className="text-sm text-amber-600 dark:text-amber-400" role="alert">
              {missingSupabaseConfigMessage}
              。
            </p>
          )}
          {errorMessage && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {errorMessage}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 md:min-w-64">
          {!user
            ? (
                <Button onClick={handleSignIn} disabled={!hasSupabaseConfig || syncStatus === 'checking'}>
                  使用 Google 登录
                </Button>
              )
            : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" onClick={handleUpload} disabled={syncStatus === 'syncing'} className="col-span-2">
                      <RefreshCw className="h-4 w-4" />
                      立即同步
                    </Button>
                  </div>
                  <Button size="sm" variant="ghost" onClick={handleSignOut}>
                    <LogOut className="h-4 w-4" />
                    退出登录
                  </Button>
                </>
              )}
          <Button size="sm" variant="outline" onClick={refreshRemote} disabled={!hasSupabaseConfig || syncStatus === 'checking'}>
            刷新状态
          </Button>
        </div>
      </div>
    </section>
  )
}
