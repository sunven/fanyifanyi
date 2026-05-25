import { isTauri } from '@tauri-apps/api/core'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClientOptions } from '@supabase/supabase-js'
import { secureStorageGet, secureStorageRemove, secureStorageSet } from './secure-storage'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const isTest = import.meta.env.MODE === 'test'

type AuthStorage = NonNullable<NonNullable<SupabaseClientOptions<'public'>['auth']>['storage']>

const authMemoryStore = new Map<string, string>()

const authStorage: AuthStorage = {
  async getItem(key) {
    if (!isTauri()) {
      return authMemoryStore.get(key) ?? null
    }
    return secureStorageGet(`supabase:${key}`)
  },
  async setItem(key, value) {
    if (!isTauri()) {
      authMemoryStore.set(key, value)
      return
    }
    await secureStorageSet(`supabase:${key}`, value)
  },
  async removeItem(key) {
    if (!isTauri()) {
      authMemoryStore.delete(key)
      return
    }
    await secureStorageRemove(`supabase:${key}`)
  },
}

export const hasSupabaseConfig = !isTest && Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = hasSupabaseConfig && supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: authStorage,
        storageKey: 'fanyifanyi-auth',
      },
    })
  : null

export function getAuthRedirectUrl() {
  return import.meta.env.VITE_AUTH_REDIRECT_URL || 'fanyifanyi://auth/callback'
}
