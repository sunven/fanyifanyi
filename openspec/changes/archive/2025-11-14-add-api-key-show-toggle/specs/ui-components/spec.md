# 规格说明：API Key 显示/隐藏切换功能

## ADDED Requirements

### Requirement: 添加模型对话框中的 API Key 输入框 MUST 支持显示/隐藏切换

**描述**:
- 添加模型对话框中的 API Key 输入框 SHALL 支持显示/隐藏切换
- 输入框右侧 SHALL 有一个眼睛图标按钮
- 点击按钮 SHALL 切换输入框的显示状态
- 默认状态 SHALL 为隐藏（密码模式）

**实现位置**: `src/pages/Settings.tsx` - 添加模型对话框部分

**代码示例**:
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
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      title={showApiKey ? "隐藏 API Key" : "显示 API Key"}
    >
      {showApiKey ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
    </button>
  </div>
</div>
```

**验证**:
- TypeScript 编译无错误
- 对话框正常打开和关闭
- 输入框可以正确输入和保存

**场景**:

#### Scenario: 默认隐藏状态
**输入**:
- 打开"添加新模型"对话框

**期望输出**:
- ✅ API Key 输入框默认 type="password"
- ✅ 显示 EyeOff 图标（表示隐藏状态）
- ✅ 输入的字符显示为圆点

#### Scenario: 点击切换显示
**输入**:
- 已聚焦到 API Key 输入框

**期望输出**:
- ✅ 点击眼睛按钮后，图标变为 Eye
- ✅ 输入框 type 变为 "text"
- ✅ 输入的字符以明文显示
- ✅ 按钮标题变为"隐藏 API Key"

#### Scenario: 再次点击隐藏
**输入**:
- API Key 输入框处于显示状态

**期望输出**:
- ✅ 点击眼睛按钮后，图标变回 EyeOff
- ✅ 输入框 type 变回 "password"
- ✅ 输入的字符再次变为圆点
- ✅ 按钮标题变为"显示 API Key"

---

### Requirement: 模型卡片编辑模式下的 API Key 输入框 MUST 支持显示/隐藏切换

**描述**:
- 模型卡片在编辑模式下，API Key 输入框 SHALL 支持显示/隐藏切换
- 输入框右侧 SHALL 有一个眼睛图标按钮
- 点击按钮 SHALL 切换输入框的显示状态
- 默认状态 SHALL 为隐藏（密码模式）

**实现位置**: `src/pages/Settings.tsx` - ModelCard 组件编辑模式

**代码示例**:
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
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      title={showApiKey ? "隐藏 API Key" : "显示 API Key"}
    >
      {showApiKey ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
    </button>
  </div>
</div>
```

**验证**:
- TypeScript 编译无错误
- 编辑模式正常进入和退出
- 输入框可以正确编辑和保存

**场景**:

#### Scenario: 编辑模式下显示切换
**输入**:
- 点击模型的"编辑"按钮进入编辑模式

**期望输出**:
- ✅ API Key 输入框显示切换按钮
- ✅ 默认状态为隐藏（显示 EyeOff 图标）
- ✅ 输入的字符显示为圆点

#### Scenario: 切换显示状态
**输入**:
- 在编辑模式下点击眼睛按钮

**期望输出**:
- ✅ 图标从 EyeOff 变为 Eye
- ✅ 输入框显示明文
- ✅ 按钮标题更新

#### Scenario: 退出编辑模式重置状态
**输入**:
- 在显示状态下点击"取消"按钮

**期望输出**:
- ✅ 退出编辑模式
- ✅ 下次进入编辑模式时默认隐藏状态

---

### Requirement: 眼睛图标按钮 MUST 正确显示和交互

**描述**:
- 按钮 SHALL 使用 `Eye` 和 `EyeOff` 图标
- 按钮 SHALL 有适当的悬停效果
- 按钮 SHALL 有正确的定位，不遮挡输入内容
- 按钮 SHALL 有可访问性标题

**样式要求**:
- 位置：输入框右侧，内部对齐
- 图标大小：h-4 w-4 (16x16px)
- 颜色：text-muted-foreground，hover 时变为 text-foreground
- 悬停效果：使用 Tailwind 的 transition-colors

**验证**:
- 图标在浅色和深色主题下都可见
- 按钮响应点击事件
- 按钮有适当的视觉反馈

**场景**:

#### Scenario: 按钮样式正确
**输入**:
- 渲染添加模型对话框或编辑模式

**期望输出**:
- ✅ 按钮位置在输入框右侧
- ✅ 按钮不遮挡输入内容
- ✅ 按钮图标大小合适
- ✅ 按钮有文字提示（title 属性）

#### Scenario: 悬停效果
**输入**:
- 鼠标悬停在眼睛按钮上

**期望输出**:
- ✅ 按钮颜色从 muted 变为 foreground
- ✅ 有平滑的过渡动画
- ✅ 指针变为手型光标

---

### Requirement: 显示状态切换 MUST 正确工作

**描述**:
- 切换显示状态 SHALL 不影响输入框的值
- 切换显示状态 SHALL 不触发表单提交
- 状态切换 SHALL 是即时的
- 每次切换 SHALL 完全反转当前状态

**实现细节**:
- 使用 `useState` 管理状态
- 点击处理器中直接取反当前值
- 不调用 event.preventDefault()

**验证**:
- 切换状态时输入内容不变
- 切换状态不会触发表单验证
- 连续点击按钮时状态正确反转

**场景**:

#### Scenario: 切换不影响输入值
**输入**:
- 在 API Key 输入框中输入 "test-key"
- 点击按钮切换到显示状态
- 再点击按钮切换到隐藏状态

**期望输出**:
- ✅ 输入框中的值始终为 "test-key"
- ✅ 显示时显示完整密钥
- ✅ 隐藏时显示为圆点
- ✅ 切换过程值不会丢失

#### Scenario: 连续切换
**输入**:
- 快速连续点击眼睛按钮多次

**期望输出**:
- ✅ 状态正确反转（显示→隐藏→显示...）
- ✅ 图标和输入框类型保持同步
- ✅ 没有状态错误或卡顿

---

## 测试验证

### 功能测试

1. **添加对话框测试**
   - [ ] 对话框中的 API Key 输入框支持显示/隐藏
   - [ ] 切换按钮位置正确
   - [ ] 切换状态即时生效
   - [ ] 保存后状态正确

2. **编辑模式测试**
   - [ ] 模型卡片的编辑模式支持显示/隐藏
   - [ ] 切换按钮位置正确
   - [ ] 退出编辑模式时状态重置
   - [ ] 保存后状态正确

3. **UI/UX 测试**
   - [ ] 眼睛图标正确显示（Eye/EyeOff）
   - [ ] 悬停效果正常工作
   - [ ] 按钮有正确的标题提示
   - [ ] 在浅色和深色主题下都可见

4. **交互测试**
   - [ ] 点击按钮正确切换状态
   - [ ] 切换不影响输入内容
   - [ ] 连续点击无问题
   - [ ] 键盘导航正常

### 兼容性测试

- [ ] 与现有表单验证兼容
- [ ] 与保存功能兼容
- [ ] 与取消功能兼容
- [ ] 在不同屏幕尺寸下正常显示

### 无障碍性测试

- [ ] 按钮可通过 Tab 键访问
- [ ] 按钮有适当的 ARIA 标签（title）
- [ ] 屏幕阅读器可读出按钮功能
- [ ] 按钮有明确的视觉焦点

## 验收标准

所有 REQUIREMENT 必须通过才能验收：

1. ✅ 添加模型对话框中的 API Key 输入框支持显示/隐藏切换
2. ✅ 模型卡片编辑模式下的 API Key 输入框支持显示/隐藏切换
3. ✅ 眼睛图标按钮正确显示和交互
4. ✅ 显示状态切换正确工作
5. ✅ 所有测试场景通过
6. ✅ TypeScript 编译通过
7. ✅ 构建成功

完成所有测试后，该规格即视为验收通过。
