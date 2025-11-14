# 使用 Tailwind Typography 修复 Streamdown 列表样式问题

## 摘要

通过集成 Tailwind CSS Typography 插件，为 Streamdown 渲染的 Markdown 内容提供专业的排版样式，解决 `li` 元素左边被遮挡的问题，并确保列表在翻译显示区域中正确渲染。

## 问题描述

Streamdown 是一个用于流式渲染 Markdown 的 React 组件库。当前的实现缺乏统一的排版样式，导致：

1. **列表项左边被遮挡**: `li` 元素的默认样式设置不当，项目符号或数字编号可能被遮挡
2. **排版不统一**: Markdown 内容（标题、列表、段落等）缺乏专业的视觉层次
3. **嵌套列表支持不足**: 嵌套列表的层级缩进不够清晰

## Why

修复列表渲染问题是必要的，因为：

1. **用户体验**: 列表是翻译输出中最常用的格式之一，样式问题直接影响用户对翻译结果的理解
2. **可读性**: 被遮挡的项目符号或序号会让用户困惑，无法快速浏览列表内容
3. **一致性**: 整个应用使用 Tailwind CSS 和 shadcn/ui，保持统一的视觉风格很重要
4. **专业性**: 翻译工具需要提供专业的排版，Typography 插件提供业界标准样式
5. **维护性**: 使用官方插件比自定义 CSS 更容易维护和升级

## What Changes

1. **添加依赖**: 在 `package.json` 中添加 `@tailwindcss/typography@^0.5.19` 开发依赖
2. **配置插件**: 在 `src/index.css` 中添加 `@plugin "@tailwindcss/typography";` 配置
3. **应用样式**: 在 `src/components/translate-display/index.tsx` 的 Streamdown 容器上添加 `prose prose-sm dark:prose-invert` 类
4. **构建验证**: 确保 TypeScript 编译通过，Vite 构建成功

## 解决方案

使用 Tailwind CSS Typography 插件 (`@tailwindcss/typography`) 解决样式问题：

### 核心方法

1. **安装依赖**: 添加 `@tailwindcss/typography` 插件
2. **配置 Tailwind**: 在 Tailwind 配置中启用 `typography` 插件
3. **应用样式**: 在 `TranslateDisplay` 组件的 Streamdown 容器上应用 `prose` 类

### 技术优势

- **标准化排版**: Typography 插件提供业界标准的 Markdown 渲染样式
- **完整覆盖**: 自动处理标题、段落、列表、代码块、引用等所有元素
- **主题适配**: 自动适配深色/浅色主题
- **维护性**: 避免自定义 CSS，由官方插件维护更新

## 范围

- **修改文件**:
  - `package.json` - 添加 `@tailwindcss/typography` 依赖
  - `src/index.css` - 启用 typography 插件配置
  - `src/components/translate-display/index.tsx` - 应用 `prose` 类到 Streamdown

- **影响组件**: `src/components/translate-display/index.tsx`
- **测试**: 手动测试翻译输出的 Markdown 列表渲染

## 验收标准

- [ ] 有序列表 (ol/li) 正确显示，数字编号左对齐且可见
- [ ] 无序列表 (ul/li) 正确显示，项目符号左对齐且可见
- [ ] 嵌套列表正确缩进，不同层级有清晰的视觉层次
- [ ] 标题、段落、代码块等其他 Markdown 元素样式统一
- [ ] 在深色模式 (`dark:`) 下样式正确适配
- [ ] 在翻译显示区域内所有内容都不被遮挡

## 风险

- **低**: 
  - 仅添加样式插件和修改 CSS 类，不影响功能
  - Typography 插件是官方维护的稳定插件
  - 回退简单：移除 `prose` 类即可恢复默认样式

## 相关资源

- Tailwind Typography 插件: https://tailwindcss.com/docs/typography-plugin
- Streamdown 库: https://github.com/jpmorganchase/streamdown
- 当前使用位置: `src/components/translate-display/index.tsx`
