import type { Update } from '@tauri-apps/plugin-updater'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkForUpdates,
  downloadAndInstall,
  UpdateErrorType,
} from '../updater'

// Mock Tauri APIs
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
}))

describe('updater error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('network error scenarios', () => {
    it('should handle connection refused error', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockRejectedValue(new Error('ECONNREFUSED: Connection refused'))

      await expect(checkForUpdates()).rejects.toMatchObject({
        type: UpdateErrorType.NETWORK_ERROR,
        recoverable: true,
        message: expect.stringContaining('ECONNREFUSED'),
      })
    })

    it('should handle DNS resolution error', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockRejectedValue(new Error('ENOTFOUND: DNS lookup failed'))

      await expect(checkForUpdates()).rejects.toMatchObject({
        type: UpdateErrorType.NETWORK_ERROR,
        recoverable: true,
      })
    })

    it('should handle timeout error', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockRejectedValue(new Error('ETIMEDOUT: Request timeout'))

      await expect(checkForUpdates()).rejects.toMatchObject({
        type: UpdateErrorType.NETWORK_ERROR,
        recoverable: true,
      })
    })

    it('should handle generic network error', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockRejectedValue(new Error('Network error occurred'))

      await expect(checkForUpdates()).rejects.toMatchObject({
        type: UpdateErrorType.NETWORK_ERROR,
        recoverable: true,
      })
    })

    it('should handle fetch error', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockRejectedValue(new Error('Fetch failed: unable to connect'))

      await expect(checkForUpdates()).rejects.toMatchObject({
        type: UpdateErrorType.NETWORK_ERROR,
        recoverable: true,
      })
    })
  })

  describe('invalid manifest scenarios', () => {
    it('should handle JSON parse error', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockRejectedValue(new Error('JSON parse error: unexpected token'))

      await expect(checkForUpdates()).rejects.toMatchObject({
        type: UpdateErrorType.PARSE_ERROR,
        recoverable: false,
      })
    })

    it('should handle malformed manifest', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockRejectedValue(new Error('Invalid manifest format'))

      await expect(checkForUpdates()).rejects.toMatchObject({
        type: UpdateErrorType.PARSE_ERROR,
        recoverable: false,
      })
    })

    it('should handle missing required fields', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockRejectedValue(new Error('Parse error: missing version field'))

      await expect(checkForUpdates()).rejects.toMatchObject({
        type: UpdateErrorType.PARSE_ERROR,
        recoverable: false,
      })
    })
  })

  describe('signature verification scenarios', () => {
    it('should handle signature verification failure', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockRejectedValue(new Error('Signature verification failed'))

      await expect(checkForUpdates()).rejects.toMatchObject({
        type: UpdateErrorType.VERIFICATION_ERROR,
        recoverable: false,
      })
    })

    it('should handle invalid signature', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockRejectedValue(new Error('Signature does not match'))

      await expect(checkForUpdates()).rejects.toMatchObject({
        type: UpdateErrorType.VERIFICATION_ERROR,
        recoverable: false,
      })
    })

    it('should handle checksum mismatch', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockRejectedValue(new Error('Checksum verification failed'))

      await expect(checkForUpdates()).rejects.toMatchObject({
        type: UpdateErrorType.VERIFICATION_ERROR,
        recoverable: false,
      })
    })

    it('should handle hash mismatch', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockRejectedValue(new Error('Hash mismatch: file corrupted'))

      await expect(checkForUpdates()).rejects.toMatchObject({
        type: UpdateErrorType.VERIFICATION_ERROR,
        recoverable: false,
      })
    })
  })

  describe('download error scenarios', () => {
    it('should handle download interruption', async () => {
      const mockUpdate = {
        version: '1.0.1',
        downloadAndInstall: vi.fn(() => Promise.reject(new Error('Download interrupted'))),
      } as unknown as Update

      await expect(downloadAndInstall(mockUpdate)).rejects.toMatchObject({
        type: UpdateErrorType.DOWNLOAD_ERROR,
        recoverable: true,
      })
    })

    it('should handle download network error', async () => {
      const mockUpdate = {
        version: '1.0.1',
        downloadAndInstall: vi.fn(() => Promise.reject(new Error('Network error during download'))),
      } as unknown as Update

      await expect(downloadAndInstall(mockUpdate)).rejects.toMatchObject({
        type: UpdateErrorType.NETWORK_ERROR,
        recoverable: true,
      })
    })

    it('should handle insufficient disk space', async () => {
      const mockUpdate = {
        version: '1.0.1',
        downloadAndInstall: vi.fn(() => Promise.reject(new Error('Download failed: insufficient disk space'))),
      } as unknown as Update

      await expect(downloadAndInstall(mockUpdate)).rejects.toMatchObject({
        type: UpdateErrorType.DOWNLOAD_ERROR,
        recoverable: true,
      })
    })
  })

  describe('install error scenarios', () => {
    it('should handle install permission error', async () => {
      const mockUpdate = {
        version: '1.0.1',
        downloadAndInstall: vi.fn((callback) => {
          callback({ event: 'Finished' })
          return Promise.reject(new Error('Install failed: permission denied'))
        }),
      } as unknown as Update

      await expect(downloadAndInstall(mockUpdate)).rejects.toMatchObject({
        type: UpdateErrorType.INSTALL_ERROR,
        recoverable: false,
      })
    })

    it('should handle corrupted installer', async () => {
      const mockUpdate = {
        version: '1.0.1',
        downloadAndInstall: vi.fn((callback) => {
          callback({ event: 'Finished' })
          return Promise.reject(new Error('Install error: corrupted installer'))
        }),
      } as unknown as Update

      await expect(downloadAndInstall(mockUpdate)).rejects.toMatchObject({
        type: UpdateErrorType.INSTALL_ERROR,
        recoverable: false,
      })
    })
  })

  describe('unknown error scenarios', () => {
    it('should handle unknown error types', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockRejectedValue(new Error('Something unexpected happened'))

      await expect(checkForUpdates()).rejects.toMatchObject({
        type: UpdateErrorType.UNKNOWN_ERROR,
        recoverable: true,
      })
    })

    it('should handle non-Error objects', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockRejectedValue('String error message')

      await expect(checkForUpdates()).rejects.toMatchObject({
        type: UpdateErrorType.UNKNOWN_ERROR,
        message: 'String error message',
      })
    })

    it('should handle null/undefined errors', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockRejectedValue(null)

      await expect(checkForUpdates()).rejects.toMatchObject({
        type: UpdateErrorType.UNKNOWN_ERROR,
      })
    })
  })

  describe('error recovery behavior', () => {
    it('should mark network errors as recoverable', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockRejectedValue(new Error('Network timeout'))

      try {
        await checkForUpdates()
      }
      catch (error: any) {
        expect(error.recoverable).toBe(true)
      }
    })

    it('should mark verification errors as non-recoverable', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockRejectedValue(new Error('Signature verification failed'))

      try {
        await checkForUpdates()
      }
      catch (error: any) {
        expect(error.recoverable).toBe(false)
      }
    })

    it('should mark parse errors as non-recoverable', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockRejectedValue(new Error('JSON parse error'))

      try {
        await checkForUpdates()
      }
      catch (error: any) {
        expect(error.recoverable).toBe(false)
      }
    })

    it('should mark install errors as non-recoverable', async () => {
      const mockUpdate = {
        version: '1.0.1',
        downloadAndInstall: vi.fn((callback) => {
          callback({ event: 'Finished' })
          return Promise.reject(new Error('Install failed'))
        }),
      } as unknown as Update

      try {
        await downloadAndInstall(mockUpdate)
      }
      catch (error: any) {
        expect(error.recoverable).toBe(false)
      }
    })
  })
})
