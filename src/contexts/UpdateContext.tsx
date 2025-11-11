import type { Update } from '@tauri-apps/plugin-updater'
import type { ReactNode } from 'react'
import type { UpdateError, UpdateInfo, UpdateSuccessInfo } from '../lib/updater'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  checkForUpdates,
  checkUpdateSuccess,
  confirmUpdateSuccess,
  downloadAndInstall,
  extractUpdateInfo,
  getUpdateSettings,
  saveDismissedVersion,
  saveLastChecked,
} from '../lib/updater'

/**
 * 更新状态枚举
 */
export enum UpdateStatus {
  IDLE = 'idle',
  CHECKING = 'checking',
  AVAILABLE = 'available',
  DOWNLOADING = 'downloading',
  READY = 'ready',
  ERROR = 'error',
}

/**
 * 更新上下文接口
 */
export interface UpdateContextType {
  // 状态
  status: UpdateStatus
  updateAvailable: boolean
  updateInfo: UpdateInfo | null
  downloading: boolean
  downloadProgress: number
  downloadTotal: number
  error: UpdateError | null
  lastChecked: Date | null
  updateSuccessInfo: UpdateSuccessInfo | null

  // 方法
  checkForUpdates: (isManualCheck?: boolean) => Promise<void>
  downloadAndInstall: () => Promise<void>
  dismissUpdate: () => void
  clearError: () => void
  retryLastAction: () => Promise<void>
  dismissUpdateSuccess: () => void
}

const UpdateContext = createContext<UpdateContextType | undefined>(undefined)

/**
 * 更新上下文 Provider 属性
 */
interface UpdateProviderProps {
  children: ReactNode
  checkOnMount?: boolean
  checkInterval?: number // 检查间隔（毫秒）
}

/**
 * 更新上下文 Provider
 */
export function UpdateProvider({
  children,
  checkOnMount = true,
  checkInterval = 24 * 60 * 60 * 1000, // 默认 24 小时
}: UpdateProviderProps) {
  const [status, setStatus] = useState<UpdateStatus>(UpdateStatus.IDLE)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadTotal, setDownloadTotal] = useState(0)
  const [error, setError] = useState<UpdateError | null>(null)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [updateSuccessInfo, setUpdateSuccessInfo] = useState<UpdateSuccessInfo | null>(null)

  const updateRef = useRef<Update | null>(null)
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastActionRef = useRef<'check' | 'download' | null>(null)
  const lastErrorTimeRef = useRef<number>(0)
  const errorCooldownMs = 60 * 60 * 1000 // 错误冷却时间：1小时

  /**
   * 检查更新
   */
  const handleCheckForUpdates = useCallback(async (isManualCheck = false) => {
    // 如果正在检查或下载，不重复执行
    if (status === UpdateStatus.CHECKING || status === UpdateStatus.DOWNLOADING) {
      return
    }

    // 如果不是手动检查，且在错误冷却期内，跳过检查
    if (!isManualCheck) {
      const now = Date.now()
      if (now - lastErrorTimeRef.current < errorCooldownMs) {
        console.warn('Skipping update check due to recent error (cooldown period)')
        return
      }
    }

    lastActionRef.current = 'check'
    setStatus(UpdateStatus.CHECKING)
    setError(null)

    try {
      const update = await checkForUpdates()

      // 保存检查时间
      saveLastChecked()
      setLastChecked(new Date())

      if (update) {
        // 检查是否是被忽略的版本
        const settings = getUpdateSettings()
        if (settings.dismissedVersion === update.version) {
          setStatus(UpdateStatus.IDLE)
          return
        }

        // 有新版本可用
        updateRef.current = update
        setUpdateInfo(extractUpdateInfo(update))
        setStatus(UpdateStatus.AVAILABLE)
      }
      else {
        // 没有新版本
        setStatus(UpdateStatus.IDLE)
        setUpdateInfo(null)
      }
    }
    catch (err) {
      const updateError = err as UpdateError

      // 记录错误时间（用于冷却）
      lastErrorTimeRef.current = Date.now()

      // 所有类型的检查错误都静默处理（不打扰用户）
      // 只在控制台记录，不显示弹窗
      console.warn('Update check failed:', updateError.type, updateError.message)
      setStatus(UpdateStatus.IDLE)

      // 只有手动检查时才显示错误
      if (isManualCheck) {
        setError(updateError)
        setStatus(UpdateStatus.ERROR)
      }
    }
  }, [status, errorCooldownMs])

  /**
   * 下载并安装更新
   */
  const handleDownloadAndInstall = useCallback(async () => {
    if (!updateRef.current || (status !== UpdateStatus.AVAILABLE && status !== UpdateStatus.ERROR)) {
      return
    }

    lastActionRef.current = 'download'
    setStatus(UpdateStatus.DOWNLOADING)
    setError(null)
    setDownloadProgress(0)
    setDownloadTotal(0)

    try {
      await downloadAndInstall(
        updateRef.current,
        (progress, total) => {
          setDownloadProgress(progress)
          setDownloadTotal(total)
        },
      )

      // 下载完成，准备重启
      setStatus(UpdateStatus.READY)
    }
    catch (err) {
      const updateError = err as UpdateError

      // 下载错误提供重试选项（可恢复）
      // 验证错误显示警告（不可恢复，安全问题）
      // 安装错误显示错误信息（不可恢复）
      setError(updateError)
      setStatus(UpdateStatus.ERROR)
    }
  }, [status])

  /**
   * 忽略当前更新
   */
  const dismissUpdate = useCallback(() => {
    if (updateInfo) {
      saveDismissedVersion(updateInfo.version)
    }
    setStatus(UpdateStatus.IDLE)
    setUpdateInfo(null)
    updateRef.current = null
  }, [updateInfo])

  /**
   * 清除错误
   */
  const clearError = useCallback(() => {
    setError(null)
    // 如果有可用更新，返回到 AVAILABLE 状态，否则返回 IDLE
    if (updateRef.current && updateInfo) {
      setStatus(UpdateStatus.AVAILABLE)
    }
    else {
      setStatus(UpdateStatus.IDLE)
    }
  }, [updateInfo])

  /**
   * 重试上次失败的操作
   */
  const retryLastAction = useCallback(async () => {
    if (!lastActionRef.current) {
      return
    }

    if (lastActionRef.current === 'check') {
      // 重试时视为手动检查
      await handleCheckForUpdates(true)
    }
    else if (lastActionRef.current === 'download') {
      await handleDownloadAndInstall()
    }
  }, [handleCheckForUpdates, handleDownloadAndInstall])

  /**
   * 关闭更新成功提示
   */
  const dismissUpdateSuccess = useCallback(() => {
    confirmUpdateSuccess()
    setUpdateSuccessInfo(null)
  }, [])

  /**
   * 检测应用是否刚刚更新成功
   */
  useEffect(() => {
    // 使用 Promise 包装以避免直接在 useEffect 中调用 setState
    Promise.resolve().then(() => {
      const successInfo = checkUpdateSuccess()
      if (successInfo.wasUpdated) {
        setUpdateSuccessInfo(successInfo)
      }
    })
  }, [])

  /**
   * 启动时检查更新
   */
  useEffect(() => {
    if (checkOnMount) {
      const settings = getUpdateSettings()
      if (settings.autoCheck) {
        // 延迟 2 秒后检查，避免影响应用启动
        const timer = setTimeout(() => {
          handleCheckForUpdates()
        }, 2000)

        return () => clearTimeout(timer)
      }
    }
  }, [checkOnMount, handleCheckForUpdates])

  /**
   * 定时检查更新
   */
  useEffect(() => {
    if (checkInterval > 0) {
      checkIntervalRef.current = setInterval(() => {
        const settings = getUpdateSettings()
        if (settings.autoCheck) {
          handleCheckForUpdates()
        }
      }, checkInterval)

      return () => {
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current)
        }
      }
    }
  }, [checkInterval, handleCheckForUpdates])

  /**
   * 加载最后检查时间
   */
  useEffect(() => {
    const settings = getUpdateSettings()
    if (settings.lastChecked) {
      // 使用临时变量避免直接在 useEffect 中调用 setState
      const lastCheckedDate = new Date(settings.lastChecked)
      // 延迟设置以避免 React 警告
      Promise.resolve().then(() => setLastChecked(lastCheckedDate))
    }
  }, [])

  const value: UpdateContextType = useMemo(() => ({
    status,
    updateAvailable: status === UpdateStatus.AVAILABLE,
    updateInfo,
    downloading: status === UpdateStatus.DOWNLOADING,
    downloadProgress,
    downloadTotal,
    error,
    lastChecked,
    updateSuccessInfo,
    checkForUpdates: handleCheckForUpdates,
    downloadAndInstall: handleDownloadAndInstall,
    dismissUpdate,
    clearError,
    retryLastAction,
    dismissUpdateSuccess,
  }), [
    status,
    updateInfo,
    downloadProgress,
    downloadTotal,
    error,
    lastChecked,
    updateSuccessInfo,
    handleCheckForUpdates,
    handleDownloadAndInstall,
    dismissUpdate,
    clearError,
    retryLastAction,
    dismissUpdateSuccess,
  ])

  return (
    <UpdateContext.Provider value={value}>
      {children}
    </UpdateContext.Provider>
  )
}

/**
 * 使用更新上下文的 Hook
 */
export function useUpdate() {
  const context = useContext(UpdateContext)
  if (context === undefined) {
    throw new Error('useUpdate must be used within an UpdateProvider')
  }
  return context
}
