import type { AIConfig, AIConfigs, TranslationProvider } from '@/lib/config'
import { ArrowLeft, Bot, Eye, EyeOff, Info, Languages, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import { AccountSyncPanel } from '@/components/AccountSyncPanel'
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
  saveAllAIConfigs,
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

const CONNECTION_ERROR_MESSAGE = '连接失败：无法访问 API Base URL。请检查地址、网络、代理设置，或服务商是否允许当前环境访问。'

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

  // Set active model
  const refreshConfigs = async () => {
    setConfigs(await loadAIConfigs())
  }

  const handleImportConfig = async (nextConfigs: AIConfigs) => {
    await saveAllAIConfigs(nextConfigs)
    await refreshConfigs()
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

  // Start editing
  const handleEdit = (id: string) => {
    setEditingId(id)
  }

  // Save edit
  const handleSaveEdit = async (id: string, updates: Partial<Omit<AIConfig, 'id'>>) => {
    try {
      await updateAIConfig(id, updates)
      await refreshConfigs()
      setEditingId(null)
    }
    catch {
      setSaveError('保存失败，请重试')
      setShowSaveAlert(true)
    }
  }

  // Cancel edit
  const handleCancelEdit = () => {
    setEditingId(null)
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
    <div className="min-h-screen">
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
          <h1 className="text-2xl font-bold">设置</h1>
        </NonMacOnly>
        <AccountSyncPanel configs={configs} onImportConfig={handleImportConfig} />
        <Separator />

        <div className="p-2">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Languages className="h-5 w-5 text-blue-600" />
                <h2 className="text-xl font-bold">翻译引擎</h2>
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
              <Bot className="h-5 w-5 text-blue-600" />
              <h2 className="text-xl font-bold">AI 模型配置</h2>
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
            ? <p className="text-sm text-muted-foreground">正在加载模型配置...</p>
            : (
                <div className="space-y-2">
                  {configs.models.map(model => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      isActive={model.id === configs.activeModelId}
                      isEditing={editingId === model.id}
                      onSetActive={handleSetActive}
                      onEdit={handleEdit}
                      onSave={handleSaveEdit}
                      onCancel={handleCancelEdit}
                      onDelete={() => setShowDeleteConfirm(model.id)}
                      onTest={handleTestModel}
                      isTesting={testingModelId === model.id}
                      isTestDisabled={testingModelId !== null}
                      testResult={modelTestResults[model.id]}
                    />
                  ))}
                </div>
              )}

          <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <strong>提示：</strong>
              {' '}
              API Key 会迁移到系统安全存储；登录后会通过 Supabase 自动同步配置。点击模型卡片可切换使用的模型。
            </p>
          </div>
        </div>
        <Separator />

        {/* About/Update Section */}
        <div className="p-2">
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl font-bold">关于</h2>
          </div>

          <div className="space-y-2">
            {/* Version */}
            <div className="flex items-center justify-between pb-2">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">当前版本</h3>
                <p className="text-2xl font-bold">{appVersion}</p>
              </div>
              <Badge variant="secondary" className="text-sm">桌面应用</Badge>
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
                    <p className="text-sm text-blue-600 dark:text-blue-400">正在下载更新...</p>
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

      {/* Add Model Dialog */}
      <AlertDialog open={showAddDialog} onOpenChange={handleAddDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>添加新模型</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    模型名称 *
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                    placeholder="GPT-4o Mini"
                    value={newModel.name}
                    onChange={e => setNewModel(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    API Base URL *
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                    placeholder="https://api.openai.com/v1"
                    value={newModel.baseURL}
                    onChange={e => setNewModel(prev => ({ ...prev, baseURL: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showNewApiKey ? 'text' : 'password'}
                      className="w-full px-3 py-2 pr-10 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                      placeholder="sk-..."
                      value={newModel.apiKey}
                      onChange={e => setNewModel(prev => ({ ...prev, apiKey: e.target.value }))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      title={showNewApiKey ? '隐藏 API Key' : '显示 API Key'}
                      aria-label={showNewApiKey ? '隐藏 API Key' : '显示 API Key'}
                      onClick={() => setShowNewApiKey(prev => !prev)}
                    >
                      {showNewApiKey
                        ? <EyeOff className="h-4 w-4" />
                        : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    模型标识 *
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                    placeholder="gpt-4o-mini"
                    value={newModel.model}
                    onChange={e => setNewModel(prev => ({ ...prev, model: e.target.value }))}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleAddDialogOpenChange(false)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleAddModel}>
              添加
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

// Model Card Component
interface ModelCardProps {
  model: AIConfig
  isActive: boolean
  isEditing: boolean
  onSetActive: (id: string) => void
  onEdit: (id: string) => void
  onSave: (id: string, updates: Partial<Omit<AIConfig, 'id'>>) => void
  onCancel: () => void
  onDelete: () => void
  onTest: (model: AIConfig) => void
  isTesting: boolean
  isTestDisabled: boolean
  testResult?: ModelTestResult
}

function ModelCard({
  model,
  isActive,
  isEditing,
  onSetActive,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onTest,
  isTesting,
  isTestDisabled,
  testResult,
}: ModelCardProps) {
  const [editForm, setEditForm] = useState(model)
  const [showApiKey, setShowApiKey] = useState(false)

  const handleSave = () => {
    onSave(model.id, {
      name: editForm.name,
      baseURL: editForm.baseURL,
      apiKey: editForm.apiKey,
      model: editForm.model,
    })
    setShowApiKey(false)
  }

  const handleCancel = () => {
    setShowApiKey(false)
    onCancel()
  }

  const handleStartEdit = () => {
    setShowApiKey(false)
    onEdit(model.id)
  }

  return (
    <Card
      className={`p-4 transition-all ${
        isActive ? 'border-blue-500 border-2 bg-blue-50 dark:bg-blue-950/20' : 'hover:border-gray-400'
      }`}
    >
      {isEditing
        ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">模型名称</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                  value={editForm.name}
                  onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">API Base URL</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                  value={editForm.baseURL}
                  onChange={e => setEditForm(prev => ({ ...prev, baseURL: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    className="w-full px-3 py-2 pr-10 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                    value={editForm.apiKey}
                    onChange={e => setEditForm(prev => ({ ...prev, apiKey: e.target.value }))}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    title={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                    aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                    onClick={() => setShowApiKey(prev => !prev)}
                  >
                    {showApiKey
                      ? <EyeOff className="h-4 w-4" />
                      : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">模型标识</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                  value={editForm.model}
                  onChange={e => setEditForm(prev => ({ ...prev, model: e.target.value }))}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={handleSave}>
                  保存
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancel}>
                  取消
                </Button>
              </div>
            </div>
          )
        : (
            <div>
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold">{model.name}</h3>
                    {isActive && (
                      <Badge variant="default" className="bg-blue-500">使用中</Badge>
                    )}
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>
                      <span className="font-medium">模型:</span>
                      {' '}
                      {model.model}
                    </p>
                    <p>
                      <span className="font-medium">API:</span>
                      {' '}
                      {model.baseURL}
                    </p>
                    <div className="flex items-start gap-1">
                      <span className="font-medium">Key:</span>
                      {model.apiKey
                        ? (
                            <span className="inline-flex max-w-full items-center gap-1 align-top">
                              <span className="min-w-0 break-all">
                                {showApiKey ? model.apiKey : '••••••••'}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                title={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                                aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                                onClick={() => setShowApiKey(prev => !prev)}
                              >
                                {showApiKey
                                  ? <EyeOff className="h-4 w-4" />
                                  : <Eye className="h-4 w-4" />}
                              </Button>
                            </span>
                          )
                        : <span>未设置</span>}
                    </div>
                    {testResult && (
                      <p
                        className={`pt-1 text-sm ${
                          testResult.type === 'success'
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                        role={testResult.type === 'error' ? 'alert' : 'status'}
                      >
                        {testResult.message}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {!isActive && (
                    <Button
                      size="sm"
                      onClick={() => onSetActive(model.id)}
                    >
                      设为当前
                    </Button>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onTest(model)}
                      disabled={isTestDisabled}
                    >
                      {isTesting ? '测试中' : '测试'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleStartEdit}
                    >
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onDelete}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
    </Card>
  )
}
