# 设计方案：API Key 显示/隐藏切换

## 设计决策

### 方案选择

采用标准的密码显示/隐藏切换模式，在输入框右侧添加眼睛图标按钮。

#### 备选方案比较

**方案 1: 眼睛图标按钮（选中）**
- ✅ 行业标准，用户熟悉
- ✅ 直观易懂
- ✅ 占用空间小
- ✅ 易于实现

**方案 2: 双输入框（显示/隐藏）**
- ❌ 占用空间大
- ❌ 需要同步两个输入框的值
- ❌ 复杂度高

**方案 3: 纯文本显示**
- ❌ 安全性问题
- ❌ 用户无法隐藏敏感信息

### 视觉设计

#### 按钮样式
- 位置：输入框右侧，边框内侧
- 图标：Lucide React 的 `Eye` 和 `EyeOff`
- 大小：与输入框高度匹配
- 颜色：使用 `text-muted-foreground` 和 `hover:text-foreground`
- 间距：右侧内边距相同，保持视觉平衡

#### 交互设计
- **默认状态**: 隐藏（type="password"）
- **点击**: 切换到显示（type="text"）
- **图标切换**: `EyeOff` (隐藏) ↔ `Eye` (显示)
- **悬停效果**: 使用 Tailwind 的 `hover:` 变体
- **标题提示**: "显示 API Key" / "隐藏 API Key"

### 实现细节

#### 状态管理
```typescript
const [showApiKey, setShowApiKey] = useState(false)
```

#### 输入框类型切换
```typescript
type={showApiKey ? "text" : "password"}
```

#### 图标选择
```typescript
{showApiKey ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
```

#### 按钮结构
```tsx
<button
  type="button"
  onClick={() => setShowApiKey(!showApiKey)}
  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
  title={showApiKey ? "隐藏 API Key" : "显示 API Key"}
>
```

### 位置选择

#### 添加模型对话框
- 在 API Key 输入框容器上设置 `relative` 定位
- 眼睛按钮使用 `absolute` 定位到右侧

#### 模型卡片编辑模式
- 同样使用相对/绝对定位
- 确保在所有屏幕尺寸下都能正确显示

### 无障碍性

1. **按钮类型**: 设置 `type="button"` 防止表单提交
2. **标题属性**: 提供 `title` 属性说明按钮功能
3. **键盘访问**: 按钮可通过 Tab 键访问
4. **屏幕阅读器**: 图标+标题提供足够信息

### 兼容性

- ✅ 与现有表单验证兼容
- ✅ 不影响数据保存逻辑
- ✅ 在浅色和深色主题下都可正常显示
- ✅ 与不同浏览器兼容

### 安全性考虑

1. **数据不泄露**: API Key 仍以明文存储在 localStorage（与之前相同）
2. **用户控制**: 用户可以主动选择显示或隐藏
3. **默认隐藏**: 默认状态为隐藏，保护隐私
4. **无持久化**: 显示状态不持久化，刷新后重置为隐藏
