import type { UpdateInfo } from '@/lib/updater'
import { UpdateStatus } from '@/contexts/UpdateContext'
import { UpdateErrorType } from '@/lib/updater'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog'
import { Spinner } from './ui/spinner'

interface UpdateDialogProps {
  open: boolean
  status: UpdateStatus
  updateInfo: UpdateInfo | null
  downloadProgress: number
  downloadTotal: number
  error: { type: UpdateErrorType, message: string, recoverable: boolean } | null
  onUpdate: () => void
  onDismiss: () => void
  onRetry?: () => void
  onClearError?: () => void
}

// 检测是否为开发模式
const isDevelopment = import.meta.env.DEV

export function UpdateDialog({
  open,
  status,
  updateInfo,
  downloadProgress,
  downloadTotal,
  error,
  onUpdate,
  onDismiss,
  onRetry,
  onClearError,
}: UpdateDialogProps) {
  // 计算下载进度百分比
  const progressPercentage = downloadTotal > 0
    ? Math.round((downloadProgress / downloadTotal) * 100)
    : 0

  // 格式化文件大小
  const formatBytes = (bytes: number): string => {
    if (bytes === 0)
      return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
  }

  // 渲染不同状态的内容
  const renderContent = () => {
    // 错误状态
    if (status === UpdateStatus.ERROR && error) {
      const errorMessage = getErrorMessage(error.type)
      const errorSuggestion = getErrorSuggestion(error.type)

      return (
        <>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              更新失败
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <div>{errorMessage}</div>
              {errorSuggestion && (
                <div className="text-xs text-muted-foreground">
                  {errorSuggestion}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* 错误详情 - 开发模式或验证错误时显示 */}
          {(isDevelopment || error.type === UpdateErrorType.VERIFICATION_ERROR) && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                {isDevelopment ? '错误详情（开发模式）' : '错误详情'}
              </div>
              <div className="max-h-32 overflow-y-auto rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                <div className="font-mono break-all">{error.message}</div>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            {error.recoverable && onRetry && (
              <AlertDialogAction onClick={onRetry} className="gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4"
                >
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 16h5v5" />
                </svg>
                重试
              </AlertDialogAction>
            )}
            <AlertDialogCancel onClick={onClearError}>
              {error.recoverable ? '稍后再试' : '关闭'}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </>
      )
    }

    // 检查中状态
    if (status === UpdateStatus.CHECKING) {
      return (
        <>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Spinner className="size-4" />
              检查更新中
            </AlertDialogTitle>
            <AlertDialogDescription>
              正在检查是否有新版本可用...
            </AlertDialogDescription>
          </AlertDialogHeader>
        </>
      )
    }

    // 下载中状态
    if (status === UpdateStatus.DOWNLOADING) {
      return (
        <>
          <AlertDialogHeader>
            <AlertDialogTitle>下载更新中</AlertDialogTitle>
            <AlertDialogDescription>
              正在下载版本
              {' '}
              {updateInfo?.version}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* 下载进度条 */}
          <div className="space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {progressPercentage}
                %
              </span>
              <span>
                {formatBytes(downloadProgress)}
                {' '}
                /
                {formatBytes(downloadTotal)}
              </span>
            </div>
          </div>
        </>
      )
    }

    // 准备重启状态
    if (status === UpdateStatus.READY) {
      return (
        <>
          <AlertDialogHeader>
            <AlertDialogTitle>更新已准备就绪</AlertDialogTitle>
            <AlertDialogDescription>
              更新已下载完成，应用将重启以完成安装。
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogAction onClick={onUpdate}>
              立即重启
            </AlertDialogAction>
          </AlertDialogFooter>
        </>
      )
    }

    // 有更新可用状态
    if (status === UpdateStatus.AVAILABLE && updateInfo) {
      return (
        <>
          <AlertDialogHeader>
            <AlertDialogTitle>发现新版本</AlertDialogTitle>
            <AlertDialogDescription>
              版本
              {' '}
              {updateInfo.version}
              {' '}
              现已可用
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* 更新说明 */}
          {updateInfo.body && (
            <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/50 p-3 text-xs">
              <div className="whitespace-pre-wrap">{updateInfo.body}</div>
            </div>
          )}

          {/* 更新日期 */}
          {updateInfo.date && (
            <div className="text-xs text-muted-foreground">
              发布日期:
              {' '}
              {new Date(updateInfo.date).toLocaleDateString('zh-CN')}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel onClick={onDismiss}>
              稍后提醒
            </AlertDialogCancel>
            <AlertDialogAction onClick={onUpdate}>
              立即更新
            </AlertDialogAction>
          </AlertDialogFooter>
        </>
      )
    }

    return null
  }

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        {renderContent()}
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * 获取错误消息
 */
function getErrorMessage(errorType: UpdateErrorType): string {
  switch (errorType) {
    case UpdateErrorType.NETWORK_ERROR:
      return '无法连接到更新服务器，请检查您的网络连接。'
    case UpdateErrorType.PARSE_ERROR:
      return '更新信息格式错误，服务器返回的数据无法解析。'
    case UpdateErrorType.VERIFICATION_ERROR:
      return '更新文件验证失败，可能存在安全风险，已阻止安装。'
    case UpdateErrorType.DOWNLOAD_ERROR:
      return '下载更新失败，可能是网络不稳定或服务器问题。'
    case UpdateErrorType.INSTALL_ERROR:
      return '安装更新失败，请尝试手动下载并安装最新版本。'
    case UpdateErrorType.UNKNOWN_ERROR:
      return '发生未知错误，请稍后再试。'
    default:
      return '发生错误，请稍后再试。'
  }
}

/**
 * 获取错误建议
 */
function getErrorSuggestion(errorType: UpdateErrorType): string | null {
  switch (errorType) {
    case UpdateErrorType.NETWORK_ERROR:
      return '建议：检查网络连接后点击"重试"按钮。'
    case UpdateErrorType.PARSE_ERROR:
      return '建议：这可能是服务器配置问题，请联系开发者。'
    case UpdateErrorType.VERIFICATION_ERROR:
      return '建议：为了您的安全，请不要安装未经验证的更新。如果问题持续，请联系开发者。'
    case UpdateErrorType.DOWNLOAD_ERROR:
      return '建议：检查网络连接或稍后重试。如果问题持续，可以尝试手动下载。'
    case UpdateErrorType.INSTALL_ERROR:
      return '建议：请访问官方网站下载最新版本的安装包。'
    default:
      return null
  }
}
