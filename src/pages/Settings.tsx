import type { AIConfig } from '@/lib/config'
import { getVersion } from '@tauri-apps/api/app'
import { ArrowLeft, Check, Plus, RefreshCw, Trash2 } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { UpdateStatus, useUpdate } from '@/contexts/UpdateContext'
import {
  addAIConfig,
  deleteAIConfig,
  getAllAIConfigs,
  resetAIConfig,
  setActiveModel,
  updateAIConfig,
} from '@/lib/config'

interface SettingsProps {
  onBack: () => void
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

  // 更新相关状态
  const { status, updateInfo, lastChecked, checkForUpdates: checkUpdates, error: updateError } = useUpdate()
  const [isCheckingManually, setIsCheckingManually] = useState(false)

  // 获取应用版本
  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {
      setAppVersion('未知版本')
    })
  }, [])

  // 新模型表单状态
  const [newModel, setNewModel] = useState<Omit<AIConfig, 'id'>>({
    name: '',
    baseURL: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
  })

  // 切换激活的模型
  const handleSetActive = (id: string) => {
    setActiveModel(id)
    setConfigs(getAllAIConfigs())
  }

  // 开始编辑
  const handleEdit = (id: string) => {
    setEditingId(id)
  }

  // 保存编辑
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

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingId(null)
  }

  // 添加新模型
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

  // 删除模型
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

  // 重置配置
  const handleReset = () => {
    setShowResetConfirm(true)
  }

  // 确认重置
  const confirmReset = () => {
    const defaultConfigs = resetAIConfig()
    setConfigs(defaultConfigs)
    setShowResetConfirm(false)
  }

  // 手动检查更新
  const handleCheckUpdates = async () => {
    setIsCheckingManually(true)
    try {
      // 传递 true 表示这是手动检查，即使失败也会显示错误
      await checkUpdates(true)
    }
    finally {
      setIsCheckingManually(false)
    }
  }

  // 格式化最后检查时间
  const formatLastChecked = (date: Date | null) => {
    if (!date)
      return '从未检查'

    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1)
      return '刚刚'
    if (minutes < 60)
      return `${minutes} 分钟前`
    if (hours < 24)
      return `${hours} 小时前`
    if (days < 7)
      return `${days} 天前`

    return date.toLocaleDateString('zh-CN')
  }

  // 获取更新状态文本
  const getUpdateStatusText = () => {
    if (status === UpdateStatus.CHECKING || isCheckingManually) {
      return '正在检查更新...'
    }
    if (status === UpdateStatus.AVAILABLE && updateInfo) {
      return `发现新版本 ${updateInfo.version}`
    }
    if (status === UpdateStatus.ERROR && updateError) {
      return `检查失败: ${updateError.message}`
    }
    if (status === UpdateStatus.DOWNLOADING) {
      return '正在下载更新...'
    }
    if (status === UpdateStatus.READY) {
      return '更新已就绪，请重启应用'
    }
    return '当前已是最新版本'
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="mr-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            返回
          </Button>
          <h1 className="text-2xl font-bold">AI 模型配置</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReset}>
            重置为默认
          </Button>
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
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

      {/* 提示信息 */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
        <p className="text-sm text-blue-800">
          <strong>提示：</strong>
          {' '}
          配置保存在本地浏览器的 localStorage 中，不会上传到服务器。点击模型卡片可切换使用的模型。
        </p>
      </div>

      {/* 更新管理部分 */}
      <div className="mt-8">
        <h2 className="text-xl font-bold mb-4">关于</h2>
        <Card className="p-6">
          <div className="space-y-6">
            {/* 版本信息 */}
            <div className="flex items-center justify-between pb-4 border-b">
              <div>
                <h3 className="text-lg font-semibold mb-1">应用版本</h3>
                <p className="text-2xl font-bold text-blue-600">{appVersion}</p>
              </div>
            </div>

            {/* 更新检查 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold mb-1">软件更新</h3>
                  <p className="text-sm text-gray-600">
                    最后检查:
                    {' '}
                    {formatLastChecked(lastChecked)}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={handleCheckUpdates}
                  disabled={status === UpdateStatus.CHECKING || isCheckingManually || status === UpdateStatus.DOWNLOADING}
                >
                  <RefreshCw className={`h-4 w-4 mr-1 ${(status === UpdateStatus.CHECKING || isCheckingManually) ? 'animate-spin' : ''}`} />
                  检查更新
                </Button>
              </div>

              {/* 更新状态显示 */}
              <div
                className={`p-3 rounded-md ${
                  status === UpdateStatus.AVAILABLE
                    ? 'bg-green-50 border border-green-200'
                    : status === UpdateStatus.ERROR
                      ? 'bg-red-50 border border-red-200'
                      : status === UpdateStatus.CHECKING || isCheckingManually
                        ? 'bg-blue-50 border border-blue-200'
                        : 'bg-gray-50 border border-gray-200'
                }`}
              >
                <p
                  className={`text-sm ${
                    status === UpdateStatus.AVAILABLE
                      ? 'text-green-800'
                      : status === UpdateStatus.ERROR
                        ? 'text-red-800'
                        : status === UpdateStatus.CHECKING || isCheckingManually
                          ? 'text-blue-800'
                          : 'text-gray-700'
                  }`}
                >
                  {getUpdateStatusText()}
                </p>
                {status === UpdateStatus.AVAILABLE && updateInfo && (
                  <div className="mt-2 text-sm text-gray-600">
                    <p className="font-medium">更新说明:</p>
                    <p className="mt-1 whitespace-pre-wrap">{updateInfo.body || '无更新说明'}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* 添加模型对话框 */}
      <AlertDialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>添加新模型</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-900">
                    模型名称 *
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="GPT-4o Mini"
                    value={newModel.name}
                    onChange={e => setNewModel(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-900">
                    API Base URL *
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://api.openai.com/v1"
                    value={newModel.baseURL}
                    onChange={e => setNewModel(prev => ({ ...prev, baseURL: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-900">
                    API Key
                  </label>
                  <input
                    type="password"
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    placeholder="sk-..."
                    value={newModel.apiKey}
                    onChange={e => setNewModel(prev => ({ ...prev, apiKey: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-900">
                    模型标识 *
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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

      {/* 删除确认对话框 */}
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

      {/* 保存失败提示对话框 */}
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

      {/* 重置确认对话框 */}
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

// 模型卡片组件
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
        isActive ? 'border-blue-500 border-2 bg-blue-50' : 'hover:border-gray-400'
      }`}
    >
      {isEditing
        ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">模型名称</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editForm.name}
                  onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">API Base URL</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editForm.baseURL}
                  onChange={e => setEditForm(prev => ({ ...prev, baseURL: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">API Key</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  value={editForm.apiKey}
                  onChange={e => setEditForm(prev => ({ ...prev, apiKey: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">模型标识</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      <span className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500 text-white rounded-full">
                        <Check className="h-3 w-3" />
                        使用中
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 text-sm text-gray-600">
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
                      <Check className="h-4 w-4 mr-1" />
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
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
    </Card>
  )
}
