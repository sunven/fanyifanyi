import type { Update } from '@tauri-apps/plugin-updater'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  UpdateErrorType,
  checkForUpdates,
  clearDismissedVersion,
  clearUpdateInProgress,
  downloadAndInstall,
  extractUpdateInfo,
  getCurrentVersion,
  getUpdateInProgress,
  getUpdateSettings,
  markUpdateInProgress,
  saveDismissedVersion,
  saveLastChecked,
  setAutoCheck,
} from '../updater'

// Mock Tauri APIs
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
}))

describe('updater utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('checkForUpdates', () => {
    it('should return update when available', async () => {
      const mockUpdate = {
        version: '1.0.1',
        date: '2025-11-10',
        body: 'Bug fixes',
      } as Update

      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockResolvedValue(mockUpdate)

      const result = await checkForUpdates()
      expect(result).toEqual(mockUpdate)
    })

    it('should return null when no update available', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockResolvedValue(null)

      const result = await checkForUpdates()
      expect(result).toBeNull()
    })

    it('should throw UpdateError on network failure', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockRejectedValue(new Error('Network error: connection failed'))

      await expect(checkForUpdates()).rejects.toMatchObject({
        type: UpdateErrorType.NETWORK_ERROR,
        recoverable: true,
      })
    })

    it('should throw UpdateError on parse failure', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockRejectedValue(new Error('JSON parse error'))

      await expect(checkForUpdates()).rejects.toMatchObject({
        type: UpdateErrorType.PARSE_ERROR,
        recoverable: false,
      })
    })

    it('should throw UpdateError on verification failure', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      vi.mocked(check).mockRejectedValue(new Error('Signature verification failed'))

      await expect(checkForUpdates()).rejects.toMatchObject({
        type: UpdateErrorType.VERIFICATION_ERROR,
        recoverable: false,
      })
    })
  })

  describe('downloadAndInstall', () => {
    it('should download and install update with progress tracking', async () => {
      const mockUpdate = {
        version: '1.0.1',
        downloadAndInstall: vi.fn((callback) => {
          // Simulate download progress
          callback({ event: 'Started', data: { contentLength: 1000 } })
          callback({ event: 'Progress', data: { chunkLength: 500, contentLength: 1000 } })
          callback({ event: 'Finished' })
          return Promise.resolve()
        }),
      } as unknown as Update

      const { relaunch } = await import('@tauri-apps/plugin-process')
      vi.mocked(relaunch).mockResolvedValue()

      const progressCallback = vi.fn()
      await downloadAndInstall(mockUpdate, progressCallback)

      expect(progressCallback).toHaveBeenCalledWith(0, 1000)
      expect(progressCallback).toHaveBeenCalledWith(500, 1000)
      expect(relaunch).toHaveBeenCalled()
    })

    it('should mark update in progress', async () => {
      const mockUpdate = {
        version: '1.0.1',
        downloadAndInstall: vi.fn(() => Promise.resolve()),
      } as unknown as Update

      const { relaunch } = await import('@tauri-apps/plugin-process')
      vi.mocked(relaunch).mockResolvedValue()

      await downloadAndInstall(mockUpdate)

      const inProgress = getUpdateInProgress()
      expect(inProgress).toBe('1.0.1')
    })

    it('should clear update marker on download failure', async () => {
      const mockUpdate = {
        version: '1.0.1',
        downloadAndInstall: vi.fn(() => Promise.reject(new Error('Download failed'))),
      } as unknown as Update

      await expect(downloadAndInstall(mockUpdate)).rejects.toMatchObject({
        type: UpdateErrorType.DOWNLOAD_ERROR,
      })

      const inProgress = getUpdateInProgress()
      expect(inProgress).toBeNull()
    })

    it('should throw UpdateError on install failure', async () => {
      const mockUpdate = {
        version: '1.0.1',
        downloadAndInstall: vi.fn((callback) => {
          callback({ event: 'Finished' })
          return Promise.reject(new Error('Install failed'))
        }),
      } as unknown as Update

      await expect(downloadAndInstall(mockUpdate)).rejects.toMatchObject({
        type: UpdateErrorType.INSTALL_ERROR,
        recoverable: false,
      })
    })
  })

  describe('extractUpdateInfo', () => {
    it('should extract update information', () => {
      const mockUpdate = {
        version: '1.0.1',
        date: '2025-11-10',
        body: 'Bug fixes and improvements',
      } as Update

      const info = extractUpdateInfo(mockUpdate)

      expect(info).toEqual({
        version: '1.0.1',
        date: '2025-11-10',
        body: 'Bug fixes and improvements',
      })
    })

    it('should handle missing date and body', () => {
      const mockUpdate = {
        version: '1.0.1',
      } as Update

      const info = extractUpdateInfo(mockUpdate)

      expect(info.version).toBe('1.0.1')
      expect(info.date).toBeDefined()
      expect(info.body).toBe('')
    })
  })

  describe('localStorage operations', () => {
    describe('getUpdateSettings', () => {
      it('should return default settings when localStorage is empty', () => {
        const settings = getUpdateSettings()

        expect(settings).toEqual({
          autoCheck: true,
          lastChecked: null,
          dismissedVersion: null,
        })
      })

      it('should return saved settings', () => {
        localStorage.setItem('updater_auto_check', 'false')
        localStorage.setItem('updater_last_checked', '2025-11-10T12:00:00Z')
        localStorage.setItem('updater_dismissed_version', '1.0.0')

        const settings = getUpdateSettings()

        expect(settings).toEqual({
          autoCheck: false,
          lastChecked: '2025-11-10T12:00:00Z',
          dismissedVersion: '1.0.0',
        })
      })
    })

    describe('saveLastChecked', () => {
      it('should save current timestamp', () => {
        const beforeTime = new Date().getTime()
        saveLastChecked()
        const afterTime = new Date().getTime()

        const saved = localStorage.getItem('updater_last_checked')
        expect(saved).toBeDefined()

        const savedTime = new Date(saved!).getTime()
        expect(savedTime).toBeGreaterThanOrEqual(beforeTime)
        expect(savedTime).toBeLessThanOrEqual(afterTime)
      })
    })

    describe('saveDismissedVersion and clearDismissedVersion', () => {
      it('should save and clear dismissed version', () => {
        saveDismissedVersion('1.0.0')
        expect(localStorage.getItem('updater_dismissed_version')).toBe('1.0.0')

        clearDismissedVersion()
        expect(localStorage.getItem('updater_dismissed_version')).toBeNull()
      })
    })

    describe('setAutoCheck', () => {
      it('should save auto check setting', () => {
        setAutoCheck(false)
        expect(localStorage.getItem('updater_auto_check')).toBe('false')

        setAutoCheck(true)
        expect(localStorage.getItem('updater_auto_check')).toBe('true')
      })
    })

    describe('markUpdateInProgress and clearUpdateInProgress', () => {
      it('should mark and clear update in progress', () => {
        markUpdateInProgress('1.0.1')

        expect(getUpdateInProgress()).toBe('1.0.1')
        expect(localStorage.getItem('updater_previous_version')).toBeDefined()

        clearUpdateInProgress()

        expect(getUpdateInProgress()).toBeNull()
        expect(localStorage.getItem('updater_previous_version')).toBeNull()
      })
    })
  })

  describe('getCurrentVersion', () => {
    it('should return current version from environment', () => {
      const version = getCurrentVersion()
      expect(version).toBeDefined()
      expect(typeof version).toBe('string')
    })
  })
})
