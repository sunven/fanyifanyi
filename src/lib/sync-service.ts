import type { User } from '@supabase/supabase-js'
import type { AIConfigs } from './config'
import { getAuthRedirectUrl, hasSupabaseConfig, supabase } from './supabase'

export const missingSupabaseConfigMessage = import.meta.env.DEV
  ? '缺少 Supabase 配置，请检查 .env.local'
  : '缺少 Supabase 构建配置，请检查发布环境变量 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY'

export interface SyncRow {
  user_id: string
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

const DEVICE_ID_KEY = 'fanyifanyi_sync_device_id'

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

export async function signInWithGoogle() {
  if (!supabase) {
    throw new Error(missingSupabaseConfigMessage)
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getAuthRedirectUrl(),
      skipBrowserRedirect: true,
    },
  })

  if (error) {
    throw error
  }
  if (!data.url) {
    throw new Error('没有收到 Google 登录地址')
  }
  return data.url
}

export async function handleOAuthCallback(url: string) {
  if (!supabase) {
    throw new Error(missingSupabaseConfigMessage)
  }

  const parsed = new URL(url)
  const errorDescription = parsed.searchParams.get('error_description') ?? parsed.searchParams.get('error')
  if (errorDescription) {
    throw new Error(errorDescription)
  }

  const code = parsed.searchParams.get('code')
  if (!code) {
    return null
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    throw error
  }
  return data.session
}

export async function getCurrentUser(): Promise<User | null> {
  if (!supabase) {
    return null
  }

  const { data } = await supabase.auth.getUser()
  return data.user
}

export async function signOut() {
  if (!supabase) {
    return
  }
  const { error } = await supabase.auth.signOut()
  if (error) {
    throw error
  }
}

export async function fetchRemoteConfig(): Promise<SyncRow | null> {
  if (!supabase) {
    throw new Error(missingSupabaseConfigMessage)
  }

  const { data, error } = await supabase
    .from('user_ai_configs')
    .select('user_id,schema_version,revision,updated_at,device_id,plaintext')
    .maybeSingle()

  if (error) {
    throw error
  }
  return data as SyncRow | null
}

export async function uploadConfig(configs: AIConfigs) {
  if (!supabase) {
    throw new Error(missingSupabaseConfigMessage)
  }

  const user = await getCurrentUser()
  if (!user) {
    throw new Error('请先登录 Google 账号')
  }

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

  const { error } = await supabase
    .from('user_ai_configs')
    .upsert({
      user_id: user.id,
      schema_version: payload.schemaVersion,
      revision: payload.revision,
      updated_at: payload.updatedAt,
      device_id: payload.deviceId,
      plaintext: payload,
    }, {
      onConflict: 'user_id',
    })

  if (error) {
    throw error
  }
  return payload
}

export function downloadConfig(row: SyncRow): SyncPayloadPlaintext {
  if (!row.plaintext) {
    throw new Error('云端配置是旧格式，请先点击立即同步覆盖为自动同步格式')
  }
  return validateSyncPayload(row.plaintext)
}

export { hasSupabaseConfig, supabase }
