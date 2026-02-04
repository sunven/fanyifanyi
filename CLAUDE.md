
# CLAUDE.md

本文档为 Claude Code (claude.ai/code) 在此仓库中处理代码时提供指导。

## 项目概述

**fanyifanyi**（翻译翻译）是一个基于 Tauri v2 + React + TypeScript 构建的桌面翻译和词典应用程序。它提供 AI 驱动的翻译（使用 OpenAI 兼容 API）和词典查询（通过有道词典 API）。

## 开发命令

### 运行应用程序

```bash
pnpm dev          # 启动 Vite 开发服务器 + Tauri 窗口
pnpm tauri dev    # 启动开发模式的替代方式
```

### 构建

```bash
pnpm build        # TypeScript 编译 + Vite 构建
pnpm tauri build  # 构建生产版桌面应用程序
```

### 代码质量

```bash
npx eslint .      # 运行 linter（antfu 配置）
```

### 预览

```bash
pnpm preview      # 本地预览生产版构建
```

## 架构概述

### 前端-后端通信

这是一个 **Tauri IPC 应用程序**，其中：

- **前端**：React 使用 `invoke('command_name', { args })` 调用 Rust 后端
- **后端**：标记为 `#[tauri::command]` 的 Rust 函数处理请求
- **安全性**：权限在 `src-tauri/capabilities/default.json` 中配置

示例：

```typescript
// 前端（TypeScript）
import { invoke } from '@tauri-apps/api/core'
const data = await invoke<any>('get_dict_data', { q: 'hello' })

// 后端（Rust） - src-tauri/src/lib.rs
#[tauri::command]
async fn get_dict_data(q: String) -> Result<serde_json::Value, String>
```

### 两个核心功能

1. **词典模式**（后端处理）
   - 用户输入 → Tauri 命令 `get_dict_data` → Rust HTTP 请求到有道 API → 显示结果
   - 实现：`src-tauri/src/lib.rs`（后端）+ `src/components/dictionary-display/`（前端）

2. **翻译模式**（前端处理）
   - 用户输入 → OpenAI API 调用（直接从浏览器） → 显示翻译
   - 实现：`src/lib/ai.ts` + `src/components/translate-display/`
   - 使用 OpenAI SDK 和 `dangerouslyAllowBrowser: true`

### 多模型 AI 配置

应用程序支持多个 AI 提供商（OpenAI、DeepSeek 等）：

- **存储**：localStorage，键为 `ai_configs`
- **结构**：模型数组 + 活跃模型 ID
- **管理**：`src/lib/config.ts` 提供 CRUD 操作
- **UI**：设置页面（`src/pages/Settings.tsx`）供用户配置
- **默认**：DeepSeek V3（通过 Volces）和 GPT-4o Mini

## 重要目录

- `src/pages/` - 主应用程序页面（主页、设置）
- `src/components/dictionary-display/` - 词典功能组件（单词标题、定义、短语、同义词、相关词）
- `src/components/translate-display/` - AI 翻译组件
- `src/components/ui/` - shadcn/ui 基础组件（按钮、卡片、对话框等）
- `src/lib/` - 核心工具（AI 集成、配置管理、工具函数）
- `src-tauri/src/` - Rust 后端代码
- `src-tauri/capabilities/` - Tauri 安全权限

## 重要技术细节

### 防抖模式

所有 API 调用都经过防抖处理（1000ms）以防止过多请求：

```typescript
import { useDebounce } from 'react-use'

useDebounce(getDictData, 1000, [q])
```

### Tauri 配置

- **窗口大小**：固定 400×600px（不可最大化）
- **开发端口**：1420（Vite），1421（HMR WebSocket）
- **CSP**：禁用（`null`）以允许从浏览器调用 OpenAI API
- **插件**：`tauri-plugin-opener`、`tauri-plugin-http`

### 添加新的 Tauri 命令

1. 在 `src-tauri/src/lib.rs` 中使用 `#[tauri::command]` 定义函数
2. 添加到 `run()` 函数中的 `invoke_handler![]` 宏
3. 使用 `invoke('command_name', { args })` 从前端调用
4. 如需要，更新 `src-tauri/capabilities/default.json` 中的权限

### 样式

- **框架**：Tailwind CSS v4 与 CSS 变量
- **组件**：shadcn/ui 带有 "new-york" 样式变体
- **主题**：在 `src/index.css` 中使用 OKLCH 颜色空间定义
- **深色模式**：通过 `:is(.dark *)` 自定义变体支持
- **工具**：`clsx` + `tailwind-merge` 通过 `src/lib/utils.ts` 中的 `cn()` 辅助函数

### 构建错误说明

如果遇到构建错误，请参考：<https://github.com/tauri-apps/tauri/issues/7338#issuecomment-2933086418>

## 路径别名

TypeScript 和 Vite 都使用 `@/*` → `./src/*` 映射。对于 src 文件始终使用 `@/` 导入：

```typescript
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
```

## API 集成

### 词典 API（Rust 后端）

- **端点**：`dict.youdao.com/jsonapi`
- **参数**：`q`（搜索词）、`dicts`（功能标志 JSON）
- **实现**：`src-tauri/src/lib.rs` 中的 `get_dict_data` 命令
- **功能**：定义、短语、同义词、相关词、词形

### 翻译 API（前端）

- **库**：`openai` npm 包
- **配置**：`src/lib/config.ts` 支持多模型
- **系统提示**：专业的中英互译器，保留格式，无解释
- **实现**：`src/lib/ai.ts` 中的 `translate()` 函数

## UI 组件模式

### 词典显示组件

每个标签页都有其自己的组件，结构一致：

- `word-header.tsx` - 标题 + 发音
- `word-forms.tsx` - 语法形式
- `word-definitions.tsx` - 按词性分类的含义
- `phrases-tab.tsx` - 常用短语
- `synonyms-tab.tsx` - 按词性分组
- `related-wordsTab.tsx` - 类似词汇

### 状态管理

没有全局状态库。使用 React hooks：

- `useState` 用于本地状态
- `useDebounce` 来自 `react-use` 用于 API 调用防抖
- localStorage 用于持久化配置（AI 模型）

## 测试

目前没有配置测试套件。添加测试时，请遵循以下模式：

- `src/lib/` 工具函数的单元测试（ai.ts、config.ts）
- Tauri 命令的集成测试
- UI 组件的组件测试

## 常见开发任务

### 添加新的 AI 模型提供商

1. 用户通过设置页面 UI 添加
2. 配置通过 `src/lib/config.ts` 中的 `addAIConfig()` 存储在 localStorage 中
3. 使用 `setActiveModel()` 切换活跃模型
4. 翻译自动使用新的活跃模型

### 修改词典显示

1. `src/components/dictionary-display/` 中的组件
2. 由有道 API 响应定义的数据结构
3. 每个标签页组件处理 API 响应的一部分

### 更改窗口大小

编辑 `src-tauri/tauri.conf.json`：

```json
"windows": [{
  "width": 400,
  "height": 600
}]
```
