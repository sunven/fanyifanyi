import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountSyncPanel } from '../AccountSyncPanel'

const {
  fetchRemoteConfig,
  getCurrentUser,
  onAuthStateChange,
  onImportConfig,
  uploadConfig,
} = vi.hoisted(() => ({
  fetchRemoteConfig: vi.fn(),
  getCurrentUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  onImportConfig: vi.fn(),
  uploadConfig: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
}))

vi.mock('@tauri-apps/plugin-deep-link', () => ({
  getCurrent: vi.fn(),
  onOpenUrl: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
}))

vi.mock('@/lib/sync-service', () => ({
  downloadConfig: vi.fn(),
  fetchRemoteConfig,
  getCurrentUser,
  handleOAuthCallback: vi.fn(),
  hasSupabaseConfig: true,
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
  supabase: {
    auth: {
      onAuthStateChange,
    },
  },
  uploadConfig,
}))

describe('account sync panel', () => {
  beforeEach(() => {
    fetchRemoteConfig.mockReset()
    getCurrentUser.mockReset()
    onAuthStateChange.mockReset()
    onImportConfig.mockReset()
    uploadConfig.mockReset()

    getCurrentUser.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    })
    onAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    })
  })

  it('does not upload local config when the remote read fails after login', async () => {
    fetchRemoteConfig.mockRejectedValue(new Error('remote select failed'))

    render(
      <AccountSyncPanel
        configs={{
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
        }}
        onImportConfig={onImportConfig}
      />,
    )

    await waitFor(() => expect(fetchRemoteConfig).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('alert')).toHaveTextContent('remote select failed')
    expect(uploadConfig).not.toHaveBeenCalled()
    expect(onImportConfig).not.toHaveBeenCalled()
  })
})
