import type { Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { check } from '@tauri-apps/plugin-updater'

/**
 * 更新错误类型
 */
export enum UpdateErrorType {
  NETWORK_ERROR = 'network_error',
  PARSE_ERROR = 'parse_error',
  VERIFICATION_ERROR = 'verification_error',
  DOWNLOAD_ERROR = 'download_error',
  INSTALL_ERROR = 'install_error',
  UNKNOWN_ERROR = 'unknown_error',
}

/**
 * 更新错误接口
 */
export interface UpdateError {
  type: UpdateErrorType
  message: string
  recoverable: boolean
}

/**
 * 更新信息接口
 */
export interface UpdateInfo {
  version: string
  date: string
  body: string
}

/**
 * 分类错误类型
 * @param error 原始错误对象
 * @param context 错误上下文（'check' 或 'download'）
 * @returns UpdateError 对象
 */
function classifyError(error: unknown, context: 'check' | 'download'): UpdateError {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const lowerMessage = errorMessage.toLowerCase()

  let errorType = UpdateErrorType.UNKNOWN_ERROR
  let recoverable = true

  // 网络错误 - 可恢复
  if (
    lowerMessage.includes('network')
    || lowerMessage.includes('fetch')
    || lowerMessage.includes('timeout')
    || lowerMessage.includes('connection')
    || lowerMessage.includes('econnrefused')
    || lowerMessage.includes('enotfound')
    || lowerMessage.includes('etimedout')
  ) {
    errorType = UpdateErrorType.NETWORK_ERROR
    recoverable = true
  }
  // 解析错误 - 不可恢复
  else if (
    lowerMessage.includes('parse')
    || lowerMessage.includes('json')
    || lowerMessage.includes('invalid')
    || lowerMessage.includes('malformed')
  ) {
    errorType = UpdateErrorType.PARSE_ERROR
    recoverable = false
  }
  // 验证错误 - 不可恢复（安全问题）
  else if (
    lowerMessage.includes('signature')
    || lowerMessage.includes('verification')
    || lowerMessage.includes('verify')
    || lowerMessage.includes('checksum')
    || lowerMessage.includes('hash')
  ) {
    errorType = UpdateErrorType.VERIFICATION_ERROR
    recoverable = false
  }
  // 下载错误 - 可恢复
  else if (context === 'download' && lowerMessage.includes('download')) {
    errorType = UpdateErrorType.DOWNLOAD_ERROR
    recoverable = true
  }
  // 安装错误 - 不可恢复
  else if (context === 'download' && lowerMessage.includes('install')) {
    errorType = UpdateErrorType.INSTALL_ERROR
    recoverable = false
  }

  return {
    type: errorType,
    message: errorMessage,
    recoverable,
  }
}

/**
 * 检查更新
 * @returns Update 对象或 null（如果没有更新）
 * @throws UpdateError 如果检查失败
 */
export async function checkForUpdates(): Promise<Update | null> {
  try {
    const update = await check()
    return update
  }
  catch (error) {
    throw classifyError(error, 'check')
  }
}

/**
 * 下载并安装更新
 * @param update Update 对象
 * @param onProgress 下载进度回调函数
 * @throws UpdateError 如果下载或安装失败
 */
export async function downloadAndInstall(
  update: Update,
  onProgress?: (progress: number, total: number) => void,
): Promise<void> {
  let downloadCompleted = false

  try {
    // 标记更新开始，用于检测更新是否成功
    markUpdateInProgress(update.version)

    // 下载并安装更新
    await update.downloadAndInstall((event: any) => {
      switch (event.event) {
        case 'Started':
          onProgress?.(0, event.data.contentLength || 0)
          break
        case 'Progress':
          onProgress?.(event.data.chunkLength, event.data.contentLength || 0)
          break
        case 'Finished':
          downloadCompleted = true
          break
      }
    })

    // 下载完成后，触发安装并重启应用
    // relaunch() 会关闭当前应用并启动新版本
    await relaunch()
  }
  catch (error) {
    // 如果下载未完成就失败了，清除更新标记
    if (!downloadCompleted) {
      clearUpdateInProgress()
    }

    // 分类错误并抛出
    const updateError = classifyError(error, 'download')

    // 如果是安装错误，尝试回滚
    if (updateError.type === UpdateErrorType.INSTALL_ERROR) {
      console.error('Installation failed, attempting rollback...')
      // Tauri updater 会自动处理回滚，我们只需要清除标记
      clearUpdateInProgress()
    }

    throw updateError
  }
}

/**
 * 从 Update 对象提取更新信息
 */
export function extractUpdateInfo(update: Update): UpdateInfo {
  return {
    version: update.version,
    date: update.date || new Date().toISOString(),
    body: update.body || '',
  }
}

/**
 * 本地存储键
 */
const STORAGE_KEYS = {
  LAST_CHECKED: 'updater_last_checked',
  DISMISSED_VERSION: 'updater_dismissed_version',
  AUTO_CHECK: 'updater_auto_check',
  UPDATE_IN_PROGRESS: 'updater_update_in_progress',
  PREVIOUS_VERSION: 'updater_previous_version',
}

/**
 * 更新设置接口
 */
export interface UpdateSettings {
  autoCheck: boolean
  lastChecked: string | null
  dismissedVersion: string | null
}

/**
 * 获取更新设置
 */
export function getUpdateSettings(): UpdateSettings {
  try {
    return {
      autoCheck: localStorage.getItem(STORAGE_KEYS.AUTO_CHECK) !== 'false',
      lastChecked: localStorage.getItem(STORAGE_KEYS.LAST_CHECKED),
      dismissedVersion: localStorage.getItem(STORAGE_KEYS.DISMISSED_VERSION),
    }
  }
  catch {
    return {
      autoCheck: true,
      lastChecked: null,
      dismissedVersion: null,
    }
  }
}

/**
 * 保存最后检查时间
 */
export function saveLastChecked(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LAST_CHECKED, new Date().toISOString())
  }
  catch (error) {
    console.error('Failed to save last checked time:', error)
  }
}

/**
 * 保存忽略的版本
 */
export function saveDismissedVersion(version: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DISMISSED_VERSION, version)
  }
  catch (error) {
    console.error('Failed to save dismissed version:', error)
  }
}

/**
 * 清除忽略的版本
 */
export function clearDismissedVersion(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.DISMISSED_VERSION)
  }
  catch (error) {
    console.error('Failed to clear dismissed version:', error)
  }
}

/**
 * 设置自动检查
 */
export function setAutoCheck(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.AUTO_CHECK, String(enabled))
  }
  catch (error) {
    console.error('Failed to set auto check:', error)
  }
}

/**
 * 标记更新正在进行
 * @param targetVersion 目标版本号
 */
export function markUpdateInProgress(targetVersion: string): void {
  try {
    // 保存当前版本号，用于回滚检测
    const currentVersion = getCurrentVersion()
    localStorage.setItem(STORAGE_KEYS.PREVIOUS_VERSION, currentVersion)

    // 标记更新正在进行
    localStorage.setItem(STORAGE_KEYS.UPDATE_IN_PROGRESS, targetVersion)
  }
  catch (error) {
    console.error('Failed to mark update in progress:', error)
  }
}

/**
 * 清除更新进行中标记
 */
export function clearUpdateInProgress(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.UPDATE_IN_PROGRESS)
    localStorage.removeItem(STORAGE_KEYS.PREVIOUS_VERSION)
  }
  catch (error) {
    console.error('Failed to clear update in progress:', error)
  }
}

/**
 * 获取更新进行中的版本号
 * @returns 如果有更新正在进行，返回目标版本号，否则返回 null
 */
export function getUpdateInProgress(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.UPDATE_IN_PROGRESS)
  }
  catch {
    return null
  }
}

/**
 * 获取当前应用版本号
 * @returns 当前版本号
 */
export function getCurrentVersion(): string {
  // 从 package.json 导入的版本号
  // 在实际构建中，这个值会被 Vite 替换为实际的版本号
  return import.meta.env.PACKAGE_VERSION || '0.1.0'
}

/**
 * 更新成功信息接口
 */
export interface UpdateSuccessInfo {
  previousVersion: string
  currentVersion: string
  wasUpdated: boolean
}

/**
 * 检测应用是否刚刚更新
 * @returns 更新成功信息
 */
export function checkUpdateSuccess(): UpdateSuccessInfo {
  try {
    const updateInProgress = localStorage.getItem(STORAGE_KEYS.UPDATE_IN_PROGRESS)
    const previousVersion = localStorage.getItem(STORAGE_KEYS.PREVIOUS_VERSION)
    const currentVersion = getCurrentVersion()

    // 如果有更新正在进行的标记，且当前版本与目标版本匹配
    if (updateInProgress && updateInProgress === currentVersion) {
      return {
        previousVersion: previousVersion || 'unknown',
        currentVersion,
        wasUpdated: true,
      }
    }

    // 如果有更新标记但版本不匹配，说明更新可能失败了
    if (updateInProgress && updateInProgress !== currentVersion) {
      console.warn('Update may have failed: expected', updateInProgress, 'but got', currentVersion)
      // 清除标记
      clearUpdateInProgress()
    }

    return {
      previousVersion: currentVersion,
      currentVersion,
      wasUpdated: false,
    }
  }
  catch (error) {
    console.error('Failed to check update success:', error)
    return {
      previousVersion: 'unknown',
      currentVersion: getCurrentVersion(),
      wasUpdated: false,
    }
  }
}

/**
 * 确认更新成功并清除标记
 * 应该在显示更新成功消息后调用
 */
export function confirmUpdateSuccess(): void {
  clearUpdateInProgress()
}
