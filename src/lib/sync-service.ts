import type { AIConfigs } from './config'
import { invoke } from '@tauri-apps/api/core'

export const missingSyncDatabaseMessage = '请先粘贴 Supabase 连接池 URL 并保存连接'

export interface SyncRow {
  schema_version: number
  revision: string
  updated_at: string
  device_id: string
  plaintext: SyncPayloadPlaintext | null
}

export interface SyncPayloadPlaintext {
  schemaVersion: 1
  revision: string
  deviceId: string
  updatedAt: string
  activeModelId: string
  translationProvider: AIConfigs['translationProvider']
  models: AIConfigs['models']
}

export interface SyncDatabaseStatus {
  configured: boolean
  preview: string | null
}

export interface SaveSyncDatabaseUrlOptions {
  acceptInvalidTls?: boolean
}

const DEVICE_ID_KEY = 'fanyifanyi_sync_device_id'
const ACCEPT_INVALID_TLS_PARAM = 'sslaccept'
const ACCEPT_INVALID_TLS_VALUE = 'invalid'

function getDeviceId() {
  try {
    const stored = localStorage.getItem(DEVICE_ID_KEY)
    if (stored) {
      return stored
    }
    const deviceId = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, deviceId)
    return deviceId
  }
  catch {
    return `device-${Math.random().toString(36).slice(2)}`
  }
}

export function createRevision() {
  return `${Date.now()}-${getDeviceId()}-${Math.random().toString(36).slice(2, 10)}`
}

function validateSyncPayload(payload: SyncPayloadPlaintext): SyncPayloadPlaintext {
  if (payload.schemaVersion !== 1 || !Array.isArray(payload.models) || payload.models.length === 0) {
    throw new Error('云端配置格式无效')
  }
  if (!payload.models.some(model => model.id === payload.activeModelId)) {
    throw new Error('云端配置缺少当前模型')
  }
  return {
    ...payload,
    translationProvider: payload.translationProvider === 'google' || payload.translationProvider === 'microsoft'
      ? payload.translationProvider
      : 'ai',
  }
}

export function previewDatabaseUrl(databaseUrl: string): string | null {
  const value = databaseUrl.trim()
  if (!value) {
    return null
  }

  try {
    const parsed = new URL(value)
    if (!parsed.hostname.endsWith('.pooler.supabase.com') && !parsed.hostname.endsWith('.supabase.co')) {
      return null
    }
    const database = parsed.pathname.replace(/^\/+/, '') || 'postgres'
    const port = parsed.port || (parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:' ? '5432' : '')
    const host = port ? `${parsed.hostname}:${port}` : parsed.hostname
    const user = parsed.username ? `${decodeURIComponent(parsed.username)}:****@` : ''
    return `${user}${host}/${database}`
  }
  catch {
    return null
  }
}

export function buildSyncDatabaseUrl(databaseUrl: string, options: SaveSyncDatabaseUrlOptions = {}) {
  const value = databaseUrl.trim()
  if (!options.acceptInvalidTls) {
    return value
  }

  const parsed = new URL(value)
  parsed.searchParams.set(ACCEPT_INVALID_TLS_PARAM, ACCEPT_INVALID_TLS_VALUE)
  return parsed.toString()
}

export async function getSyncDatabaseStatus(): Promise<SyncDatabaseStatus> {
  return invoke<SyncDatabaseStatus>('sync_database_status')
}

export async function saveSyncDatabaseUrl(
  databaseUrl: string,
  options: SaveSyncDatabaseUrlOptions = {},
): Promise<SyncDatabaseStatus> {
  return invoke<SyncDatabaseStatus>('sync_database_save_url', {
    databaseUrl: buildSyncDatabaseUrl(databaseUrl, options),
  })
}

export async function clearSyncDatabaseUrl(): Promise<void> {
  await invoke('sync_database_clear')
}

export async function fetchRemoteConfig(): Promise<SyncRow | null> {
  return invoke<SyncRow | null>('sync_fetch_config')
}

export async function uploadConfig(configs: AIConfigs) {
  const updatedAt = new Date().toISOString()
  const payload: SyncPayloadPlaintext = {
    schemaVersion: 1,
    revision: createRevision(),
    deviceId: getDeviceId(),
    updatedAt,
    activeModelId: configs.activeModelId,
    translationProvider: configs.translationProvider,
    models: configs.models,
  }

  await invoke('sync_upload_config', { payload })
  return payload
}

export function downloadConfig(row: SyncRow): SyncPayloadPlaintext {
  if (!row.plaintext) {
    throw new Error('云端配置是旧格式，请先点击立即同步覆盖为自动同步格式')
  }
  return validateSyncPayload(row.plaintext)
}
