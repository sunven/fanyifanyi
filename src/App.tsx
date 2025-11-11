import { UpdateDialog } from './components/UpdateDialog'
import { UpdateSuccessDialog } from './components/UpdateSuccessDialog'
import { UpdateProvider, UpdateStatus, useUpdate } from './contexts/UpdateContext'
import Home from './pages/Home'

function AppContent() {
  const {
    status,
    updateInfo,
    downloadProgress,
    downloadTotal,
    error,
    updateSuccessInfo,
    downloadAndInstall,
    dismissUpdate,
    clearError,
    retryLastAction,
    dismissUpdateSuccess,
  } = useUpdate()

  // 确定对话框是否应该显示
  const isDialogOpen = status === UpdateStatus.AVAILABLE
    || status === UpdateStatus.DOWNLOADING
    || status === UpdateStatus.READY
    || status === UpdateStatus.ERROR

  // 处理更新操作
  const handleUpdate = () => {
    if (status === UpdateStatus.AVAILABLE) {
      downloadAndInstall()
    }
    else if (status === UpdateStatus.READY) {
      // 重启操作已在 downloadAndInstall 中处理
      // 这里只是为了完整性，实际上不会执行到这里
      downloadAndInstall()
    }
  }

  // 处理重试 - 使用 retryLastAction 重试上次失败的操作
  const handleRetry = () => {
    if (error?.recoverable) {
      retryLastAction()
    }
  }

  return (
    <>
      <Home />
      <UpdateDialog
        open={isDialogOpen}
        status={status}
        updateInfo={updateInfo}
        downloadProgress={downloadProgress}
        downloadTotal={downloadTotal}
        error={error}
        onUpdate={handleUpdate}
        onDismiss={dismissUpdate}
        onRetry={handleRetry}
        onClearError={clearError}
      />
      <UpdateSuccessDialog
        open={updateSuccessInfo?.wasUpdated === true}
        successInfo={updateSuccessInfo}
        onDismiss={dismissUpdateSuccess}
      />
    </>
  )
}

function App() {
  return (
    <UpdateProvider checkOnMount={true} checkInterval={24 * 60 * 60 * 1000}>
      <AppContent />
    </UpdateProvider>
  )
}

export default App
