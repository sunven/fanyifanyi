import { logger } from './logger'

/**
 * Updater phase type for tracking update progress
 */
export type UpdaterPhase = 'idle' | 'checking' | 'available' | 'downloading' | 'installing'

/**
 * Update info interface
 */
export interface UpdateInfo {
  version: string
  date: string
  body: string
}

/**
 * Check options for update checking
 */
export interface CheckOptions {
  /** Whether to show notification if no update is available */
  silent?: boolean
}

/**
 * Result of checking for updates
 */
export interface CheckResult {
  /** Whether an update is available */
  available: boolean
  /** The update handle if available */
  update: UpdateHandle | null
}

/**
 * Handle for an available update
 */
export interface UpdateHandle {
  version: string
  date: string
  body: string
  downloadAndInstall: (onProgress?: (event: ProgressEvent) => void) => Promise<void>
}

/**
 * Progress event during download
 */
export interface ProgressEvent {
  event: 'Started' | 'Progress' | 'Finished'
  data: {
    chunkLength?: number
    contentLength?: number
  }
}

/**
 * Get current app version
 */
export async function getCurrentVersion(): Promise<string> {
  const { getVersion } = await import('@tauri-apps/api/app')
  return getVersion()
}

/**
 * Check for updates
 */
export async function checkForUpdate(_opts?: CheckOptions): Promise<CheckResult> {
  // Skip check in dev mode - updater only works in production
  if (import.meta.env.DEV) {
    console.warn('Update checking is disabled in development mode')
    return { available: false, update: null }
  }

  const { check } = await import('@tauri-apps/plugin-updater')

  try {
    const update = await check()
    if (!update) {
      return { available: false, update: null }
    }

    return {
      available: true,
      update: mapUpdateHandle(update),
    }
  }
  catch (error) {
    logger.error('checkForUpdate', error)
    console.error('Failed to check for updates:', error)

    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('network') || error.message.includes('fetch')) {
        throw new Error('网络连接失败，请检查网络设置')
      }
      if (error.message.includes('404') || error.message.includes('Not Found')) {
        throw new Error('未找到更新服务器，请稍后再试')
      }
      throw new Error(`检查更新失败: ${error.message}`)
    }

    throw new Error('检查更新时发生未知错误')
  }
}

/**
 * Map raw Tauri Update to our UpdateHandle
 */
function mapUpdateHandle(raw: any): UpdateHandle {
  return {
    version: raw.version,
    date: raw.date,
    body: raw.body,
    downloadAndInstall: async (onProgress?: (event: ProgressEvent) => void) => {
      await raw.downloadAndInstall((event: any) => {
        onProgress?.(event)
      })
    },
  }
}

/**
 * Relaunch the app
 */
export async function relaunchApp(): Promise<void> {
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}
