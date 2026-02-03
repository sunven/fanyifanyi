import type { AIConfig } from '@/lib/config'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { getCurrentVersion, useUpdate } from '@/contexts/UpdateContext'
import {
  addAIConfig,
  deleteAIConfig,
  getAllAIConfigs,
  resetAIConfig,
  setActiveModel,
  updateAIConfig,
} from '@/lib/config'

interface SettingsProps {
  onBack?: () => void
}

export default function Settings({ onBack }: SettingsProps) {
  const [configs, setConfigs] = useState(() => getAllAIConfigs())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showSaveAlert, setShowSaveAlert] = useState(false)
  const [appVersion, setAppVersion] = useState<string>('加载中...')

  // Update state
  const { hasUpdate, updateInfo, isChecking, checkUpdate, dismissUpdate, downloadAndInstall, error, isDevMode } = useUpdate()

  // Get app version
  useEffect(() => {
    getCurrentVersion().then(setAppVersion).catch(() => {
      setAppVersion('未知版本')
    })
  }, [])

  // New model form state
  const [newModel, setNewModel] = useState<Omit<AIConfig, 'id'>>({
    name: '',
    baseURL: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
  })

  // Set active model
  const handleSetActive = (id: string) => {
    setActiveModel(id)
    setConfigs(getAllAIConfigs())
  }

  // Start editing
  const handleEdit = (id: string) => {
    setEditingId(id)
  }

  // Save edit
  const handleSaveEdit = (id: string, updates: Partial<Omit<AIConfig, 'id'>>) => {
    try {
      updateAIConfig(id, updates)
      setConfigs(getAllAIConfigs())
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
  const handleAddModel = () => {
    try {
      if (!newModel.name || !newModel.baseURL || !newModel.model) {
        setSaveError('请填写所有必填字段')
        setShowSaveAlert(true)
        return
      }
      addAIConfig(newModel)
      setConfigs(getAllAIConfigs())
      setShowAddDialog(false)
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

  // Delete model
  const handleDeleteModel = (id: string) => {
    try {
      deleteAIConfig(id)
      setConfigs(getAllAIConfigs())
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
  const confirmReset = () => {
    const defaultConfigs = resetAIConfig()
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

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="mr-2"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <h1 className="text-2xl font-bold">设置</h1>
        </div>
      </div>

      <div className="space-y-6">
        {/* AI Model Configuration Section */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">AI 模型配置</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleReset}>
                重置
              </Button>
              <Button size="sm" onClick={() => setShowAddDialog(true)}>
                添加模型
              </Button>
            </div>
          </div>

          <div className="space-y-4">
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
              />
            ))}
          </div>

          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <strong>提示：</strong>
              {' '}
              配置保存在本地浏览器的 localStorage 中，不会上传到服务器。点击模型卡片可切换使用的模型。
            </p>
          </div>
        </Card>

        {/* About/Update Section */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">关于</h2>

          <div className="space-y-6">
            {/* Version */}
            <div className="flex items-center justify-between pb-4 border-b">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">当前版本</h3>
                <p className="text-2xl font-bold">{appVersion}</p>
              </div>
              <Badge variant="secondary" className="text-sm">桌面应用</Badge>
            </div>

            {/* Update */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">软件更新</h3>
                  {isDevMode && (
                    <p className="text-sm text-amber-600 dark:text-amber-400">开发模式 - 更新功能仅在生产版本可用</p>
                  )}
                  {error && !isDevMode && (
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                  )}
                  {!error && hasUpdate && (
                    <p className="text-sm text-green-600 dark:text-green-400">
                      发现新版本
                      {' '}
                      {updateInfo?.version}
                    </p>
                  )}
                  {!error && !hasUpdate && !isChecking && (
                    <p className="text-sm text-muted-foreground">当前已是最新版本</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={hasUpdate ? 'default' : 'outline'}
                  onClick={hasUpdate ? handleDownloadAndInstall : handleCheckUpdates}
                  disabled={isChecking}
                >
                  {isChecking
                    ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                        检查中
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
              </div>

              {/* Update notes */}
              {hasUpdate && updateInfo?.body && (
                <div className="p-4 bg-muted/50 rounded-md">
                  <p className="text-sm font-medium mb-2">更新说明</p>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{updateInfo.body}</p>
                </div>
              )}

              {/* Skip version button */}
              {hasUpdate && (
                <div className="flex justify-end">
                  <Button size="sm" variant="ghost" onClick={dismissUpdate}>
                    跳过此版本
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Add Model Dialog */}
      <AlertDialog open={showAddDialog} onOpenChange={setShowAddDialog}>
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
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                    placeholder="sk-..."
                    value={newModel.apiKey}
                    onChange={e => setNewModel(prev => ({ ...prev, apiKey: e.target.value }))}
                  />
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
            <AlertDialogCancel onClick={() => setShowAddDialog(false)}>取消</AlertDialogCancel>
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
}: ModelCardProps) {
  const [editForm, setEditForm] = useState(model)

  const handleSave = () => {
    onSave(model.id, {
      name: editForm.name,
      baseURL: editForm.baseURL,
      apiKey: editForm.apiKey,
      model: editForm.model,
    })
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
                <input
                  type="password"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                  value={editForm.apiKey}
                  onChange={e => setEditForm(prev => ({ ...prev, apiKey: e.target.value }))}
                />
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
                <Button size="sm" variant="outline" onClick={onCancel}>
                  取消
                </Button>
              </div>
            </div>
          )
        : (
            <div>
              <div className="flex items-start justify-between">
                <div className="flex-1">
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
                    <p>
                      <span className="font-medium">Key:</span>
                      {' '}
                      {model.apiKey ? '••••••••' : '未设置'}
                    </p>
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
                      onClick={() => onEdit(model.id)}
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
