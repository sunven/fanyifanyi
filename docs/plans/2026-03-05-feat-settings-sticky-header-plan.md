---
title: 设置页面顶部标题行固定
type: feat
status: active
date: 2026-03-05
---

# 设置页面顶部标题行固定

## 概述

在设置页面滚动时，将顶部的"返回"按钮和"设置"标题行固定在页面顶部，提升用户体验。

## 问题陈述

当前设置页面（`src/pages/Settings.tsx`）的标题行会随页面内容一起滚动。当用户添加了多个 AI 模型配置或查看更新说明时，向下滚动后无法快速返回或看到当前所在页面。

## 解决方案

使用 CSS `position: sticky` 将标题行固定在页面顶部。

## 技术方案

### 修改文件

`src/pages/Settings.tsx` (第 155 行)

### 实现细节

修改 header div 的 className：

```diff
- <div className="flex items-center justify-between mb-6">
+ <div className="sticky top-0 z-10 bg-background flex items-center justify-between mb-6 py-2 -mx-4 px-4 border-b">
```

### 样式说明

| 类名 | 用途 |
|------|------|
| `sticky top-0` | 固定在顶部 |
| `z-10` | 确保在其他内容之上 |
| `bg-background` | 背景色遮盖滚动内容 |
| `py-2` | 垂直内边距 |
| `-mx-4 px-4` | 抵消父容器 padding，让背景延伸到边缘 |
| `border-b` | 底部边框，视觉分隔 |

### 注意事项

`position: sticky` 需要父容器没有 `overflow: hidden/auto/scroll`。当前 Settings 组件的父容器 `<div className="p-4 max-w-4xl mx-auto">` 未设置 overflow，可正常工作。

## 验收标准

- [ ] 滚动设置页面时，标题行固定在顶部
- [ ] 标题行有背景色，滚动内容不会透出
- [ ] 返回按钮始终可见且可点击
- [ ] 深色模式下显示正常

## 测试计划

1. 添加多个 AI 模型配置，使页面内容超出可视区域
2. 向下滚动页面，验证标题行固定在顶部
3. 点击返回按钮，验证导航功能正常
4. 切换深色模式，验证样式正确

## 影响范围

- 仅影响 `src/pages/Settings.tsx`
- 不影响其他页面或组件
- 不影响现有功能
