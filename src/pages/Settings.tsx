import type { AIConfig, TranslationProvider } from '@/lib/config'
import { ArrowLeft, Bot, Check, Eye, EyeOff, Info, Languages, Loader2, Pencil, Play, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { NonMacOnly, TitleBarSpacer, WindowTitleBar } from '@/components/WindowTitleBar'
import { getCurrentVersion, useUpdate } from '@/contexts/UpdateContext'
import { testAIConfig } from '@/lib/ai'
import {
  addAIConfig,
  deleteAIConfig,
  getAllAIConfigs,
  loadAIConfigs,
  resetAIConfig,
  setActiveModel,
  setTranslationProvider,
  updateAIConfig,
} from '@/lib/config'

interface SettingsProps {
  onBack?: () => void
  initialSection?: 'updates'
}

interface ModelTestResult {
  type: 'success' | 'error'
  message: string
}

const NEW_MODEL_TEST_ID = 'new-model-draft'
const CONNECTION_ERROR_MESSAGE = '连接失败：无法访问 API Base URL。请检查地址、网络、代理设置，或服务商是否允许当前环境访问。'

function getEditModelTestId(id: string) {
  return `edit:${id}`
}

function ModelTestMessage({ result }: { result?: ModelTestResult }) {
  if (!result) {
    return null
  }

  return (
    <p
      className={`pt-1 text-sm ${
        result.type === 'success'
          ? 'text-green-600 dark:text-green-400'
          : 'text-red-600 dark:text-red-400'
      }`}
      role={result.type === 'error' ? 'alert' : 'status'}
    >
      {result.message}
    </p>
  )
}

function getModelTestErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return '测试超时，请检查网络连接或 API Base URL'
  }
  const message = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : ''
  if (message.includes('Connection error')) {
    return CONNECTION_ERROR_MESSAGE
  }
  if (message) {
    return message
  }
  return '测试失败，请检查 API Key、模型标识和网络连接'
}

export default function Settings({ onBack, initialSection }: SettingsProps) {
  const [configs, setConfigs] = useState(() => getAllAIConfigs())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showSaveAlert, setShowSaveAlert] = useState(false)
  const [showNewApiKey, setShowNewApiKey] = useState(false)
  const [showEditApiKey, setShowEditApiKey] = useState(false)
  const [testingModelId, setTestingModelId] = useState<string | null>(null)
  const [modelTestResults, setModelTestResults] = useState<Record<string, ModelTestResult>>({})
  const [appVersion, setAppVersion] = useState<string>('加载中...')
  const [isLoadingConfigs, setIsLoadingConfigs] = useState(true)
  const updateSectionRef = useRef<HTMLDivElement>(null)

  // Update state
  const { hasUpdate, updateInfo, isChecking, isDownloading, checkUpdate, dismissUpdate, downloadAndInstall, retryDownload, error, isDevMode } = useUpdate()

  // Get app version
  useEffect(() => {
    getCurrentVersion().then(setAppVersion).catch(() => {
      setAppVersion('未知版本')
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    loadAIConfigs()
      .then((loadedConfigs) => {
        if (!cancelled) {
          setConfigs(loadedConfigs)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSaveError('读取 AI 配置失败')
          setShowSaveAlert(true)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingConfigs(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (initialSection === 'updates') {
      updateSectionRef.current?.scrollIntoView({ block: 'start' })
    }
  }, [initialSection])

  // New model form state
  const [newModel, setNewModel] = useState<Omit<AIConfig, 'id'>>({
    name: '',
    baseURL: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
  })
  const [editDraft, setEditDraft] = useState<Omit<AIConfig, 'id'>>({
    name: '',
    baseURL: '',
    apiKey: '',
    model: '',
  })

  // Set active model
  const refreshConfigs = async () => {
    setConfigs(await loadAIConfigs())
  }

  const handleSetActive = async (id: string) => {
    await setActiveModel(id)
    await refreshConfigs()
  }

  const handleTranslationProviderChange = async (provider: TranslationProvider) => {
    try {
      await setTranslationProvider(provider)
      await refreshConfigs()
    }
    catch {
      setSaveError('保存翻译引擎失败，请重试')
      setShowSaveAlert(true)
    }
  }

  const clearModelTestResult = (id: string) => {
    setModelTestResults((prev) => {
      if (!(id in prev)) {
        return prev
      }
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const handleEdit = (model: AIConfig) => {
    setShowEditApiKey(false)
    setEditDraft({
      name: model.name,
      baseURL: model.baseURL,
      apiKey: model.apiKey,
      model: model.model,
    })
    clearModelTestResult(getEditModelTestId(model.id))
    setEditingId(model.id)
  }

  const handleEditDialogOpenChange = (open: boolean) => {
    if (open) {
      return
    }
    setShowEditApiKey(false)
    if (editingId) {
      clearModelTestResult(getEditModelTestId(editingId))
    }
    setEditingId(null)
  }

  const handleSaveEdit = async () => {
    if (!editingId) {
      return
    }
    if (!editDraft.name || !editDraft.baseURL || !editDraft.model) {
      setSaveError('请填写所有必填字段')
      setShowSaveAlert(true)
      return
    }
    try {
      await updateAIConfig(editingId, editDraft)
      await refreshConfigs()
      handleEditDialogOpenChange(false)
    }
    catch {
      setSaveError('保存失败，请重试')
      setShowSaveAlert(true)
    }
  }

  // Add new model
  const handleAddModel = async () => {
    try {
      if (!newModel.name || !newModel.baseURL || !newModel.model) {
        setSaveError('请填写所有必填字段')
        setShowSaveAlert(true)
        return
      }
      await addAIConfig(newModel)
      await refreshConfigs()
      setShowAddDialog(false)
      setShowNewApiKey(false)
      setModelTestResults((prev) => {
        const next = { ...prev }
        delete next[NEW_MODEL_TEST_ID]
        return next
      })
      setNewModel({
        name: '',
        baseURL: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-4o-mini',
      })
    }
    catch {
      setSaveError('添加失败，请重试')
      setShowSaveAlert(true)
    }
  }

  const handleAddDialogOpenChange = (open: boolean) => {
    setShowAddDialog(open)
    if (!open) {
      setShowNewApiKey(false)
      setModelTestResults((prev) => {
        const next = { ...prev }
        delete next[NEW_MODEL_TEST_ID]
        return next
      })
    }
  }

  const handleTestModel = async (model: AIConfig) => {
    if (testingModelId) {
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15000)

    setTestingModelId(model.id)
    setModelTestResults((prev) => {
      const next = { ...prev }
      delete next[model.id]
      return next
    })

    try {
      await testAIConfig(model, controller.signal)
      setModelTestResults(prev => ({
        ...prev,
        [model.id]: {
          type: 'success',
          message: '测试通过',
        },
      }))
    }
    catch (error) {
      setModelTestResults(prev => ({
        ...prev,
        [model.id]: {
          type: 'error',
          message: getModelTestErrorMessage(error),
        },
      }))
    }
    finally {
      window.clearTimeout(timeout)
      setTestingModelId(null)
    }
  }

  const handleTestNewModel = () => {
    void handleTestModel({
      id: NEW_MODEL_TEST_ID,
      ...newModel,
    })
  }

  const handleTestEdit = () => {
    if (!editingId) {
      return
    }
    void handleTestModel({
      id: getEditModelTestId(editingId),
      ...editDraft,
    })
  }

  // Delete model
  const handleDeleteModel = async (id: string) => {
    try {
      await deleteAIConfig(id)
      await refreshConfigs()
      setShowDeleteConfirm(null)
    }
    catch (error) {
      setSaveError(error instanceof Error ? error.message : '删除失败')
      setShowSaveAlert(true)
    }
  }

  // Reset config
  const handleReset = () => {
    setShowResetConfirm(true)
  }

  // Confirm reset
  const confirmReset = async () => {
    const defaultConfigs = await resetAIConfig()
    setConfigs(defaultConfigs)
    setShowResetConfirm(false)
  }

  // Handle check for updates
  const handleCheckUpdates = async () => {
    await checkUpdate()
  }

  // Handle download and install
  const handleDownloadAndInstall = async () => {
    await downloadAndInstall()
  }

  // Handle retry download
  const handleRetryDownload = async () => {
    await retryDownload()
  }

  return (
    <div className="min-h-dvh">
      <WindowTitleBar title="设置">
        {onBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-7 px-2 text-xs"
            aria-label="返回"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
        )}
      </WindowTitleBar>
      <TitleBarSpacer />

      <div className="p-4 max-w-4xl mx-auto space-y-6">
        <NonMacOnly>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">设置</h1>
        </NonMacOnly>
        <div className="p-2">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Languages className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold tracking-tight">翻译引擎</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                选择翻译时使用 AI 模型，或使用 Google 翻译接口。
              </p>
            </div>
            <Select
              value={configs.translationProvider}
              onValueChange={value => handleTranslationProviderChange(value as TranslationProvider)}
            >
              <SelectTrigger className="w-full md:w-56" aria-label="翻译引擎">
                <SelectValue placeholder="选择翻译引擎" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ai">AI 翻译</SelectItem>
                <SelectItem value="google">Google 翻译</SelectItem>
                <SelectItem value="microsoft">Microsoft 翻译</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {configs.translationProvider !== 'ai' && (
            <p className="mt-4 text-sm text-muted-foreground">
              当前使用第三方翻译接口；下方 AI 模型配置会保留，用于切回 AI 翻译时继续使用。
            </p>
          )}
        </div>
        <Separator />

        {/* AI Model Configuration Section */}
        <div className="p-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold tracking-tight">AI 模型配置</h2>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleReset}>
                重置
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setShowNewApiKey(false)
                  setShowAddDialog(true)
                }}
              >
                添加模型
              </Button>
            </div>
          </div>

          {isLoadingConfigs
            ? (
                <div className="space-y-2" aria-busy="true">
                  <p className="sr-only">正在加载模型配置...</p>
                  <div className="h-12 animate-pulse rounded-lg bg-muted" />
                  <div className="h-12 animate-pulse rounded-lg bg-muted" />
                </div>
              )
            : (
                <div className="space-y-1.5">
                  {configs.models.map(model => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      isActive={model.id === configs.activeModelId}
                      onSetActive={handleSetActive}
                      onEdit={handleEdit}
                      onDelete={() => setShowDeleteConfirm(model.id)}
                      onTest={handleTestModel}
                      isTesting={testingModelId === model.id}
                      isTestDisabled={testingModelId !== null}
                      testResult={modelTestResults[model.id]}
                    />
                  ))}
                </div>
              )}

          <p className="mt-2 text-xs text-muted-foreground">
            API Key 以未加密形式保存在本机。
          </p>
        </div>
        <Separator />

        {/* About/Update Section */}
        <div className="p-2">
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold tracking-tight">关于</h2>
          </div>

          <div className="space-y-2">
            {/* Version */}
            <div className="flex items-center justify-between pb-2">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">当前版本</h3>
                <p className="text-2xl font-semibold tracking-tight tabular-nums">{appVersion}</p>
              </div>
              <span className="text-xs tracking-wide text-muted-foreground">桌面应用</span>
            </div>

            {/* Update */}
            <div ref={updateSectionRef} id="settings-updates" className="space-y-2 scroll-mt-20">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">软件更新</h3>
                  {isDevMode && (
                    <p className="text-sm text-amber-600 dark:text-amber-400">开发模式 - 更新功能仅在生产版本可用</p>
                  )}
                  {!isDevMode && error && (
                    <p className="text-sm text-red-600 dark:text-red-400 mb-2">{error}</p>
                  )}
                  {!isDevMode && !error && hasUpdate && (
                    <p className="text-sm text-green-600 dark:text-green-400 mb-2">
                      发现新版本
                      {' '}
                      {updateInfo?.version}
                    </p>
                  )}
                  {!isDevMode && !error && !hasUpdate && !isChecking && !isDownloading && (
                    <p className="text-sm text-muted-foreground">当前已是最新版本</p>
                  )}
                  {!isDevMode && isDownloading && (
                    <p className="text-sm text-primary">正在下载更新...</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {/* Skip version button */}
                  {hasUpdate && !error && !isChecking && !isDownloading && (
                    <Button size="sm" variant="ghost" onClick={dismissUpdate}>
                      跳过此版本
                    </Button>
                  )}
                  {/* Main action button */}
                  <Button
                    size="sm"
                    variant={hasUpdate && !error ? 'default' : 'outline'}
                    onClick={
                      isChecking || isDownloading
                        ? undefined
                        : hasUpdate && error
                          ? handleRetryDownload
                          : hasUpdate
                            ? handleDownloadAndInstall
                            : handleCheckUpdates
                    }
                    disabled={isChecking || isDownloading}
                  >
                    {isChecking
                      ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                            检查中
                          </>
                        )
                      : isDownloading
                        ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                              下载中
                            </>
                          )
                        : hasUpdate && error
                          ? (
                              <>
                                <RefreshCw className="h-4 w-4 mr-1" />
                                重试下载
                              </>
                            )
                          : hasUpdate
                            ? (
                                <>
                                  更新到
                                  {' '}
                                  {updateInfo?.version}
                                </>
                              )
                            : (
                                <>
                                  <RefreshCw className="h-4 w-4 mr-1" />
                                  检查更新
                                </>
                              )}
                  </Button>
                  {/* Re-check button (when there's an error) */}
                  {!isChecking && !isDownloading && error && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCheckUpdates}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      重新检查
                    </Button>
                  )}
                </div>
              </div>

              {/* Update notes - show when hasUpdate, even if there's an error */}
              {hasUpdate && updateInfo?.body && (
                <div className="p-4 bg-muted/50 rounded-md">
                  <p className="text-sm font-medium mb-2">更新说明</p>
                  <div className="text-sm text-muted-foreground prose prose-sm dark:prose-invert max-w-none">
                    <Markdown>{updateInfo.body}</Markdown>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ModelFormDialog
        open={showAddDialog}
        title="添加新模型"
        submitLabel="添加"
        draft={newModel}
        onDraftChange={setNewModel}
        showApiKey={showNewApiKey}
        onToggleApiKey={() => setShowNewApiKey(prev => !prev)}
        testResult={modelTestResults[NEW_MODEL_TEST_ID]}
        isTesting={testingModelId === NEW_MODEL_TEST_ID}
        isTestDisabled={testingModelId !== null}
        onOpenChange={handleAddDialogOpenChange}
        onTest={handleTestNewModel}
        onSubmit={handleAddModel}
      />

      <ModelFormDialog
        open={editingId !== null}
        title="编辑模型"
        submitLabel="保存"
        draft={editDraft}
        onDraftChange={setEditDraft}
        showApiKey={showEditApiKey}
        onToggleApiKey={() => setShowEditApiKey(prev => !prev)}
        testResult={editingId ? modelTestResults[getEditModelTestId(editingId)] : undefined}
        isTesting={editingId !== null && testingModelId === getEditModelTestId(editingId)}
        isTestDisabled={testingModelId !== null}
        onOpenChange={handleEditDialogOpenChange}
        onTest={handleTestEdit}
        onSubmit={handleSaveEdit}
      />

      {/* Delete Confirm Dialog */}
      <AlertDialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这个模型配置吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => showDeleteConfirm && handleDeleteModel(showDeleteConfirm)}>
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save Error Dialog */}
      <AlertDialog open={showSaveAlert} onOpenChange={setShowSaveAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>操作失败</AlertDialogTitle>
            <AlertDialogDescription>
              {saveError}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowSaveAlert(false)}>
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Confirm Dialog */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认重置</AlertDialogTitle>
            <AlertDialogDescription>
              确定要重置为默认配置吗？此操作将清除您当前的所有模型设置。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReset}>
              确认重置
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ModelFormDialog({
  open,
  title,
  submitLabel,
  draft,
  onDraftChange,
  showApiKey,
  onToggleApiKey,
  testResult,
  isTesting,
  isTestDisabled,
  onOpenChange,
  onTest,
  onSubmit,
}: {
  open: boolean
  title: string
  submitLabel: string
  draft: Omit<AIConfig, 'id'>
  onDraftChange: (draft: Omit<AIConfig, 'id'>) => void
  showApiKey: boolean
  onToggleApiKey: () => void
  testResult?: ModelTestResult
  isTesting: boolean
  isTestDisabled: boolean
  onOpenChange: (open: boolean) => void
  onTest: () => void
  onSubmit: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 mt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    模型名称 *
                  </label>
                  <Input
                    type="text"
                    placeholder="GPT-4o Mini"
                    value={draft.name}
                    onChange={e => onDraftChange({ ...draft, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    模型标识 *
                  </label>
                  <Input
                    type="text"
                    placeholder="gpt-4o-mini"
                    value={draft.model}
                    onChange={e => onDraftChange({ ...draft, model: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  API Base URL *
                </label>
                <Input
                  type="text"
                  placeholder="https://api.openai.com/v1"
                  value={draft.baseURL}
                  onChange={e => onDraftChange({ ...draft, baseURL: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  API Key
                </label>
                <div className="relative">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    className="pr-10"
                    placeholder="sk-..."
                    value={draft.apiKey}
                    onChange={e => onDraftChange({ ...draft, apiKey: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    title={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                    aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                    onClick={onToggleApiKey}
                  >
                    {showApiKey
                      ? <EyeOff className="h-4 w-4" />
                      : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <ModelTestMessage result={testResult} />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onTest}
            disabled={isTestDisabled}
          >
            {isTesting ? '测试中' : '测试'}
          </Button>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault()
              onSubmit()
            }}
          >
            {submitLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function formatEndpoint(baseURL: string) {
  try {
    const url = new URL(baseURL)
    const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')
    return `${url.host}${path}`
  }
  catch {
    return baseURL
  }
}

interface ModelCardProps {
  model: AIConfig
  isActive: boolean
  onSetActive: (id: string) => void
  onEdit: (model: AIConfig) => void
  onDelete: () => void
  onTest: (model: AIConfig) => void
  isTesting: boolean
  isTestDisabled: boolean
  testResult?: ModelTestResult
}

function ModelCard({
  model,
  isActive,
  onSetActive,
  onEdit,
  onDelete,
  onTest,
  isTesting,
  isTestDisabled,
  testResult,
}: ModelCardProps) {
  const [showApiKey, setShowApiKey] = useState(false)
  const endpoint = formatEndpoint(model.baseURL)

  return (
    <Card
      className={`gap-0 px-3 py-2 shadow-none transition-colors duration-200 ${
        isActive ? 'border-primary bg-primary/6' : 'hover:border-foreground/25'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-medium tracking-tight">{model.name}</h3>
            {isActive && (
              <Badge className="h-5 shrink-0 px-1.5 py-0 text-[11px] font-medium leading-none">使用中</Badge>
            )}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {model.model !== model.name && (
              <>
                <span className="max-w-[40%] shrink-0 truncate" title={model.model}>
                  {model.model}
                </span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span className="min-w-0 truncate" title={model.baseURL}>
              {endpoint}
            </span>
            <span aria-hidden="true">·</span>
            {model.apiKey
              ? (
                  <span className="inline-flex shrink-0 items-center gap-0.5">
                    <span className={showApiKey ? 'max-w-40 truncate' : undefined}>
                      {showApiKey ? model.apiKey : '••••••••'}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-5 text-muted-foreground hover:text-foreground"
                      title={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                      aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                      onClick={() => setShowApiKey(prev => !prev)}
                    >
                      {showApiKey
                        ? <EyeOff className="size-3.5" />
                        : <Eye className="size-3.5" />}
                    </Button>
                  </span>
                )
              : <span className="shrink-0">Key 未设置</span>}
          </div>
          <ModelTestMessage result={testResult} />
        </div>
        <div className="flex shrink-0 items-center">
          {!isActive && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-primary hover:bg-primary/10"
              title="设为当前"
              aria-label="设为当前"
              onClick={() => onSetActive(model.id)}
            >
              <Check className="size-4" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            title={isTesting ? '测试中' : '测试'}
            aria-label={isTesting ? '测试中' : '测试'}
            onClick={() => onTest(model)}
            disabled={isTestDisabled}
          >
            {isTesting
              ? <Loader2 className="size-4 animate-spin" />
              : <Play className="size-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            title="编辑"
            aria-label="编辑"
            onClick={() => onEdit(model)}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-destructive"
            title="删除"
            aria-label="删除"
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </Card>
  )
}
