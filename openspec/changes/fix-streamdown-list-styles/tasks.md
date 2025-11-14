# 任务清单：使用 Tailwind Typography 修复 Streamdown 列表样式

## 任务顺序

### 1. 安装 @tailwindcss/typography 依赖

**任务**: 添加 typography 插件到项目依赖

**操作步骤**:
```bash
pnpm add -D @tailwindcss/typography
```

**验证**:
- 检查 `package.json` 中是否包含 `"@tailwindcss/typography"` 依赖
- 运行 `pnpm install` 确保依赖安装成功

**预计时间**: 2 分钟

---

### 2. 配置 Tailwind Typography 插件

**任务**: 在 Tailwind 配置中启用 typography 插件

**操作步骤**:
编辑 `src/index.css`，在 `@theme inline` 块之前添加 typography 配置：

```css
@plugin "@tailwindcss/typography";
```

**验证**:
- 检查 `src/index.css` 文件包含 typography 插件配置
- 运行 `pnpm build` 检查是否有 CSS 编译错误

**预计时间**: 3 分钟

---

### 3. 应用 Typography 样式到 Streamdown

**任务**: 在 TranslateDisplay 组件的 Streamdown 容器上应用 `prose` 类

**操作步骤**:
编辑 `src/components/translate-display/index.tsx`:

1. 找到第 49-54 行的 Streamdown 组件
2. 在 `div` 容器上添加 `prose` 类
3. 确保深色模式支持（`prose dark:prose-invert`）

**预期变更**:
```tsx
<div className="flex-1 overflow-y-auto break-words prose dark:prose-invert max-w-none">
```

**验证**:
- TypeScript 编译无错误
- 开发模式下列表样式正确显示

**预计时间**: 5 分钟

---

### 4. 测试列表样式效果

**任务**: 验证不同类型列表的渲染效果

**测试用例**:
1. **无序列表**: 
   ```
   - 项目 1
   - 项目 2
   - 项目 3
   ```

2. **有序列表**:
   ```
   1. 第一项
   2. 第二项
   3. 第三项
   ```

3. **嵌套列表**:
   ```
   - 外层项目
     - 嵌套项目 1
     - 嵌套项目 2
   - 另一个外层项目
   ```

**操作**:
- 运行 `pnpm dev` 启动应用
- 在翻译框中输入包含列表的文本
- 验证列表项目符号/数字不被遮挡
- 验证嵌套列表缩进正确
- 切换深色模式验证样式适配

**预计时间**: 10 分钟

---

### 5. 验证整体排版效果

**任务**: 检查 Typography 样式对其他 Markdown 元素的影响

**检查元素**:
- [ ] 标题 (h1-h6)
- [ ] 段落 (p)
- [ ] 代码块 (code)
- [ ] 引用 (blockquote)
- [ ] 链接 (a)
- [ ] 表格 (table)

**预计时间**: 5 分钟

---

### 6. 运行构建验证

**任务**: 确保生产构建成功

**操作步骤**:
```bash
pnpm build
```

**验证**:
- 构建过程无错误
- 生成的 CSS 包含 typography 样式
- 可以通过 `pnpm preview` 预览效果

**预计时间**: 3 分钟

---

## 总计预计时间

约 **30 分钟**

## 完成检查清单

- [x] `@tailwindcss/typography` 已安装
- [x] Tailwind 配置已启用 typography 插件
- [x] Streamdown 容器应用了 `prose` 类
- [x] 有序列表正确显示且不被遮挡
- [x] 无序列表正确显示且不被遮挡
- [x] 嵌套列表正确缩进
- [x] 深色模式下样式正确
- [x] 其他 Markdown 元素样式正常
- [x] 生产构建成功

## 回退方案

如需回退到修改前状态：

1. 移除 Streamdown 容器的 `prose` 类
2. （可选）删除 `@tailwindcss/typography` 依赖和插件配置
