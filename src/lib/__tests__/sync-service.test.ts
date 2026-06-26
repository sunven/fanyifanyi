import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildSyncDatabaseUrl,
  clearSyncDatabaseUrl,
  fetchRemoteConfig,
  previewDatabaseUrl,
  saveSyncDatabaseUrl,
  uploadConfig,
} from '../sync-service'

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke,
}))

describe('sync service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('previews a Supabase pooler URL without exposing the password', () => {
    expect(previewDatabaseUrl('postgresql://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres')).toBe(
      'postgres.abc:****@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
    )
  })

  it('returns null for invalid database URL previews', () => {
    expect(previewDatabaseUrl('not a url')).toBeNull()
  })

  it('returns null for database URL previews with non-Supabase hosts', () => {
    expect(previewDatabaseUrl('postgresql://postgres.example:h@example.invalid/postgres')).toBeNull()
  })

  it('adds the explicit invalid TLS opt-in parameter when requested', () => {
    expect(buildSyncDatabaseUrl(
      'postgresql://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require',
      { acceptInvalidTls: true },
    )).toBe('postgresql://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&sslaccept=invalid')
  })

  it('saves the database URL through a Tauri command', async () => {
    invoke.mockResolvedValue({
      configured: true,
      preview: 'postgres.abc:****@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
    })

    await expect(saveSyncDatabaseUrl('postgresql://postgres.abc:secret@host:6543/postgres')).resolves.toEqual({
      configured: true,
      preview: 'postgres.abc:****@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
    })
    expect(invoke).toHaveBeenCalledWith('sync_database_save_url', {
      databaseUrl: 'postgresql://postgres.abc:secret@host:6543/postgres',
    })
  })

  it('saves the database URL with invalid TLS opt-in only when requested', async () => {
    invoke.mockResolvedValue({
      configured: true,
      preview: 'postgres.abc:****@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
    })

    await saveSyncDatabaseUrl(
      'postgresql://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
      { acceptInvalidTls: true },
    )

    expect(invoke).toHaveBeenCalledWith('sync_database_save_url', {
      databaseUrl: 'postgresql://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslaccept=invalid',
    })
  })

  it('clears the stored database URL through a Tauri command', async () => {
    invoke.mockResolvedValue(undefined)

    await clearSyncDatabaseUrl()

    expect(invoke).toHaveBeenCalledWith('sync_database_clear')
  })

  it('fetches remote config without passing the database URL from the frontend', async () => {
    invoke.mockResolvedValue(null)

    await expect(fetchRemoteConfig()).resolves.toBeNull()

    expect(invoke).toHaveBeenCalledWith('sync_fetch_config')
  })

  it('uploads config payload without passing the database URL from the frontend', async () => {
    invoke.mockResolvedValue(undefined)

    await uploadConfig({
      activeModelId: 'model-1',
      translationProvider: 'ai',
      models: [
        {
          id: 'model-1',
          name: 'Model One',
          baseURL: 'https://example.com/v1',
          apiKey: 'sk-local',
          model: 'one',
        },
      ],
    })

    expect(invoke).toHaveBeenCalledWith('sync_upload_config', {
      payload: expect.objectContaining({
        schemaVersion: 1,
        activeModelId: 'model-1',
        translationProvider: 'ai',
        models: [
          {
            id: 'model-1',
            name: 'Model One',
            baseURL: 'https://example.com/v1',
            apiKey: 'sk-local',
            model: 'one',
          },
        ],
      }),
    })
  })
})
