---
title: 设置页面标题行滚动时消失
category: ui-bugs
component: Settings
date: 2026-03-05
tags:
  - css
  - sticky
  - tailwind
  - tauri
related_files:
  - src/pages/Settings.tsx
---

# 设置页面标题行滚动时消失

## 问题症状

设置页面（`src/pages/Settings.tsx`）的标题行（返回按钮 + "设置"标题）会随页面内容一起滚动。当用户添加多个 AI 模型配置或查看更新说明时，向下滚动后：

- 无法快速点击返回按钮
- 看不到当前所在页面
- 需要滚动回顶部才能导航

## 根本原因

标题行使用普通的 `flex` 布局，没有固定定位。页面内容超出视口高度时，标题随内容滚动。

## 解决方案

使用 CSS `position: sticky` 将标题行固定在顶部。

### 代码更改

```diff
// src/pages/Settings.tsx:155
- <div className="flex items-center justify-between mb-6">
+ <div className="sticky top-0 z-10 bg-background flex items-center justify-between mb-6 py-2 -mx-4 px-4 border-b">
```

### 样式解释

| 类名 | 作用 |
|------|------|
| `sticky top-0` | 滚动时固定在顶部 |
| `z-10` | 确保在滚动内容之上 |
| `bg-background` | 背景色遮盖下方滚动内容 |
| `py-2` | 垂直内边距，增加点击区域 |
| `-mx-4 px-4` | 负边距 + 内边距，让背景延伸到父容器边缘 |
| `border-b` | 底部边框，视觉分隔滚动区域 |

## 关键注意事项

### overflow 依赖

`position: sticky` 要求父容器没有 `overflow: hidden/auto/scroll`。当前 Settings 组件的父容器：

```tsx
<div className="p-4 max-w-4xl mx-auto">
```

未设置 overflow，sticky 可正常工作。

### 边距扩展技巧

`-mx-4 px-4` 是一个常用模式：
- 父容器有 `p-4` 内边距
- `-mx-4` 负边距抵消父容器的水平内边距
- `px-4` 重新添加内边距
- 结果：背景延伸到边缘，内容保持对齐

## 预防措施

1. **检查父容器 overflow**：添加 sticky 前确认父级没有 overflow 限制
2. **添加背景色**：sticky 元素必须有背景色，否则滚动内容会透出
3. **添加视觉分隔**：使用 `border` 或 `shadow` 区分固定区域和滚动区域

## 相关资源

- [MDN: position: sticky](https://developer.mozilla.org/en-US/docs/Web/CSS/position#sticky)
- [Tailwind CSS: Position](https://tailwindcss.com/docs/position)
- [CSS-Tricks: Sticky Positioning](https://css-tricks.com/position-sticky-2/)
