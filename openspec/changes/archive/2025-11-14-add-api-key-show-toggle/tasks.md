# 任务清单：添加 API Key 显示/隐藏切换功能

## 任务顺序

### 1. 导入眼睛图标

**任务**: 在 Settings.tsx 中导入 Eye 和 EyeOff 图标

**操作步骤**:
```tsx
import { ArrowLeft, Check, Plus, RefreshCw, Trash2, Eye, EyeOff } from 'lucide-react'
```

**验证**:
- 检查导入语句无错误
- TypeScript 编译通过

**预计时间**: 1 分钟

---

### 2. 在添加模型对话框中添加显示/隐藏切换

**任务**: 在添加模型对话框的 API Key 输入框中添加眼睛图标切换功能

**操作步骤**:
编辑 `src/pages/Settings.tsx`:

1. 在组件顶部添加状态变量:
```tsx
const [showApiKey, setShowApiKey] = useState(false)
```

2. 找到 API Key 输入框部分（第 346-357 行），修改为：
```tsx
<div className="space-y-2">
  <label className="text-sm font-medium text-gray-900">
    API Key
  </label>
  <div className="relative">
    <input
      type={showApiKey ? "text" : "password"}
      className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono pr-10"
      placeholder="sk-..."
      value={newModel.apiKey}
      onChange={e => setNewModel(prev => ({ ...prev, apiKey: e.target.value }))}
    />
    <button
      type="button"
      onClick={() => setShowApiKey(!showApiKey)}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      title={showApiKey ? "隐藏 API Key" : "显示 API Key"}
    >
      {showApiKey ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
    </button>
  </div>
</div>
```

**关键变更**:
- 添加 `relative` 容器包装输入框
- 输入框添加 `pr-10` 右侧内边距
- 添加眼睛图标按钮，使用绝对定位
- 根据 `showApiKey` 状态切换输入框类型和图标

**验证**:
- TypeScript 编译无错误
- 对话框正常打开和关闭
- 可以输入和保存 API Key

**预计时间**: 5 分钟

---

### 3. 在 ModelCard 组件中添加显示/隐藏切换

**任务**: 在模型卡片的编辑模式下添加 API Key 显示/隐藏切换功能

**操作步骤**:
编辑 `src/pages/Settings.tsx` 中的 ModelCard 组件（第 450-589 行）:

1. 在 ModelCard 组件内部添加状态变量:
```tsx
function ModelCard({ ... }: ModelCardProps) {
  const [editForm, setEditForm] = useState(model)
  const [showApiKey, setShowApiKey] = useState(false)
```

2. 找到 API Key 输入框部分（第 498-506 行），修改为:
```tsx
<div className="space-y-2">
  <label className="text-sm font-medium">API Key</label>
  <div className="relative">
    <input
      type={showApiKey ? "text" : "password"}
      className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono pr-10"
      value={editForm.apiKey}
      onChange={e => setEditForm(prev => ({ ...prev, apiKey: e.target.value }))}
    />
    <button
      type="button"
      onClick={() => setShowApiKey(!showApiKey)}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      title={showApiKey ? "隐藏 API Key" : "显示 API Key"}
    >
      {showApiKey ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
    </button>
  </div>
</div>
```

**关键变更**:
- 添加 `relative` 容器包装输入框
- 输入框添加 `pr-10` 右侧内边距
- 添加眼睛图标按钮，使用绝对定位
- 根据 `showApiKey` 状态切换输入框类型和图标

**验证**:
- TypeScript 编译无错误
- 编辑模式正常进入和退出
- 可以编辑和保存 API Key

**预计时间**: 5 分钟

---

### 4. 测试显示/隐藏切换功能

**任务**: 验证所有位置的显示/隐藏功能都正常工作

**测试用例**:

1. **添加模型对话框测试**:
   - 打开"添加模型"对话框
   - 在 API Key 输入框中输入测试密钥
   - 点击眼睛图标，确认显示明文
   - 再次点击，确认隐藏为圆点
   - 保存模型，验证密钥正确保存

2. **编辑模式测试**:
   - 点击现有模型的"编辑"按钮
   - 在 API Key 输入框中验证切换功能
   - 测试显示和隐藏状态
   - 保存修改，验证更改正确

3. **UI 测试**:
   - 验证按钮位置不遮挡输入内容
   - 验证悬停效果正常
   - 验证图标切换正确
   - 验证按钮标题提示正确

**预计时间**: 10 分钟

---

### 5. 运行构建验证

**任务**: 确保修改后项目可以正常构建

**操作步骤**:
```bash
pnpm build
```

**验证**:
- TypeScript 编译无错误
- Vite 构建成功
- 生成的 CSS 包含所有样式

**预计时间**: 3 分钟

---

### 6. 手动测试用户体验

**任务**: 验证功能在实际使用中的表现

**操作步骤**:
```bash
pnpm dev
```

**测试场景**:
- 测试添加新模型时的 API Key 输入
- 测试编辑现有模型时的 API Key 显示
- 验证在不同浏览器中的表现
- 验证在浅色和深色主题下的显示效果

**预计时间**: 10 分钟

---

## 总计预计时间

约 **34 分钟**

## 完成检查清单

- [x] Eye 和 EyeOff 图标已导入
- [x] 添加模型对话框中的 API Key 输入框支持显示/隐藏
- [x] 模型卡片编辑模式下支持显示/隐藏
- [x] 眼睛按钮位置正确，不遮挡输入
- [x] 悬停效果正常工作
- [x] 按钮标题提示正确
- [x] 切换功能在所有场景下都正常工作
- [x] TypeScript 编译通过
- [x] 构建成功
- [x] 手动测试通过

## 回退方案

如需回退到修改前状态：

1. 移除 Eye 和 EyeOff 的导入
2. 移除所有 `showApiKey` 状态变量
3. 恢复 API Key 输入框为简单的 password 类型输入框
4. 移除眼睛图标按钮
5. 移除相关的 pr-10 内边距

## 技术注意事项

1. **状态隔离**: 每个输入框都有独立的状态管理
2. **定位方式**: 使用 Tailwind 的绝对定位确保按钮位置正确
3. **无障碍性**: 提供 title 属性和 type="button" 确保可访问性
4. **样式一致性**: 使用项目中已定义的颜色变量
5. **性能**: 状态切换即时生效，无性能影响
