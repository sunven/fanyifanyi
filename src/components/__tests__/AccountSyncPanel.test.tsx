import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountSyncPanel } from '../AccountSyncPanel'

const {
  fetchRemoteConfig,
  getSyncDatabaseStatus,
  onImportConfig,
  saveSyncDatabaseUrl,
  uploadConfig,
} = vi.hoisted(() => ({
  fetchRemoteConfig: vi.fn(),
  getSyncDatabaseStatus: vi.fn(),
  onImportConfig: vi.fn(),
  saveSyncDatabaseUrl: vi.fn(),
  uploadConfig: vi.fn(),
}))

vi.mock('@/lib/sync-service', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/sync-service')>()
  return {
    ...original,
    fetchRemoteConfig,
    getSyncDatabaseStatus,
    saveSyncDatabaseUrl,
    uploadConfig,
  }
})

const configs = {
  activeModelId: 'model-1',
  translationProvider: 'ai' as const,
  models: [
    {
      id: 'model-1',
      name: 'Model One',
      baseURL: 'https://example.com/v1',
      apiKey: 'sk-local',
      model: 'one',
    },
  ],
}

describe('account sync panel', () => {
  beforeEach(() => {
    fetchRemoteConfig.mockReset()
    getSyncDatabaseStatus.mockReset()
    onImportConfig.mockReset()
    saveSyncDatabaseUrl.mockReset()
    uploadConfig.mockReset()

    getSyncDatabaseStatus.mockResolvedValue({
      configured: false,
      preview: null,
    })
  })

  it('asks for a Supabase pooler URL instead of an account login', async () => {
    render(<AccountSyncPanel configs={configs} onImportConfig={onImportConfig} />)

    expect(await screen.findByLabelText('Supabase 连接池 URL')).toBeInTheDocument()
    expect(screen.getByLabelText('跳过数据库证书校验')).not.toBeChecked()
    expect(screen.queryByRole('button', { name: /登录/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Session pooler URI/)).toBeInTheDocument()
    expect(screen.getByText(/无法确认服务器身份/)).toBeInTheDocument()
  })

  it('previews the database URL with the password masked before saving', async () => {
    render(<AccountSyncPanel configs={configs} onImportConfig={onImportConfig} />)

    fireEvent.change(await screen.findByLabelText('Supabase 连接池 URL'), {
      target: {
        value: 'postgresql://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
      },
    })

    expect(screen.getByText(/postgres\.abc:\*\*\*\*@aws-0-us-east-1\.pooler\.supabase\.com:6543\/postgres/)).toBeInTheDocument()
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
  })

  it('saves the database URL and uploads local config when the remote config is empty', async () => {
    saveSyncDatabaseUrl.mockResolvedValue({
      configured: true,
      preview: 'postgres.abc:****@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
    })
    fetchRemoteConfig.mockResolvedValue(null)
    uploadConfig.mockResolvedValue({
      schemaVersion: 1,
      revision: 'rev-1',
      deviceId: 'device-1',
      updatedAt: '2026-06-26T00:00:00.000Z',
      activeModelId: 'model-1',
      translationProvider: 'ai',
      models: configs.models,
    })

    render(<AccountSyncPanel configs={configs} onImportConfig={onImportConfig} />)

    fireEvent.change(await screen.findByLabelText('Supabase 连接池 URL'), {
      target: {
        value: 'postgresql://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存连接' }))

    await waitFor(() => expect(saveSyncDatabaseUrl).toHaveBeenCalledTimes(1))
    expect(saveSyncDatabaseUrl).toHaveBeenCalledWith(
      'postgresql://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
      { acceptInvalidTls: false },
    )
    await waitFor(() => expect(fetchRemoteConfig).toHaveBeenCalledTimes(1))
    expect(uploadConfig).toHaveBeenCalledWith(configs)
    expect(onImportConfig).not.toHaveBeenCalled()
    expect(await screen.findByText('postgres.abc:****@aws-0-us-east-1.pooler.supabase.com:6543/postgres')).toBeInTheDocument()
  })

  it('passes the invalid TLS opt-in only when the checkbox is selected', async () => {
    saveSyncDatabaseUrl.mockResolvedValue({
      configured: true,
      preview: 'postgres.abc:****@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
    })
    fetchRemoteConfig.mockResolvedValue(null)
    uploadConfig.mockResolvedValue({
      schemaVersion: 1,
      revision: 'rev-1',
      deviceId: 'device-1',
      updatedAt: '2026-06-26T00:00:00.000Z',
      activeModelId: 'model-1',
      translationProvider: 'ai',
      models: configs.models,
    })

    render(<AccountSyncPanel configs={configs} onImportConfig={onImportConfig} />)

    fireEvent.change(await screen.findByLabelText('Supabase 连接池 URL'), {
      target: {
        value: 'postgresql://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
      },
    })
    fireEvent.click(screen.getByLabelText('跳过数据库证书校验'))
    fireEvent.click(screen.getByRole('button', { name: '保存连接' }))

    await waitFor(() => expect(saveSyncDatabaseUrl).toHaveBeenCalledTimes(1))
    expect(saveSyncDatabaseUrl).toHaveBeenCalledWith(
      'postgresql://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
      { acceptInvalidTls: true },
    )
  })

  it('does not upload local config when the remote read fails after saving the database URL', async () => {
    saveSyncDatabaseUrl.mockResolvedValue({
      configured: true,
      preview: 'postgres.abc:****@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
    })
    fetchRemoteConfig.mockRejectedValue(new Error('remote select failed'))

    render(<AccountSyncPanel configs={configs} onImportConfig={onImportConfig} />)

    fireEvent.change(await screen.findByLabelText('Supabase 连接池 URL'), {
      target: {
        value: 'postgresql://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存连接' }))

    await waitFor(() => expect(fetchRemoteConfig).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('alert')).toHaveTextContent('remote select failed')
    expect(uploadConfig).not.toHaveBeenCalled()
    expect(onImportConfig).not.toHaveBeenCalled()
  })
})
