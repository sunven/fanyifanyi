# 项目背景

## 目标

fanyifanyi（翻译翻译）是一个桌面翻译和词典应用程序，旨在为用户提供便捷的 AI 驱动翻译和词典查询功能。支持中英文互译，提供专业的词汇定义、短语、同义词和相关词汇查询。

## 技术栈

### 前端

- **React** 18.3.1 - 用户界面框架
- **TypeScript** 5.6.2 - 类型安全
- **Vite** 6.0.3 - 构建工具和开发服务器
- **Tailwind CSS** 4.1.4 - 原子化 CSS 框架
- **shadcn/ui** - 基于 Radix UI 的组件库
- **Lucide React** - 图标库
- **React Use** - React Hooks 工具库

### 后端

- **Tauri** 2 - 桌面应用框架
- **Rust** - 后端语言

### 测试

- **Vitest** - 单元测试框架
- **Testing Library** - React 组件测试
- **Happy DOM** - 轻量级 DOM 模拟

### 代码质量

- **ESLint** - 代码检查
- **@antfu/eslint-config** - ESLint 配置规范

## 项目约定

### 代码风格

- **Linting**: 使用 ESLint + @antfu/eslint-config 规范
- **TypeScript**: 严格模式，所有代码需类型定义
- **路径别名**: 使用 `@/` 指向 `src/` 目录
- **导入规范**:

  ```typescript
  import { Button } from '@/components/ui/button'
  import { cn } from '@/lib/utils'
  ```

- **命名约定**:
  - 组件: PascalCase (如 `WordHeader`)
  - 文件: kebab-case (如 `word-header.tsx`)
  - 函数/变量: camelCase (如 `getDictData`)

### 架构模式

#### Tauri IPC 架构

- **前端**: React 通过 `invoke('command_name', { args })` 调用 Rust 后端
- **后端**: Rust 函数使用 `#[tauri::command]` 宏标记
- **通信**: 基于 Tauri 的进程间通信机制

#### 状态管理

- 无全局状态库
- 使用 React Hooks (`useState`, `useEffect`)
- localStorage 用于持久化配置（AI 模型设置）
- 防抖模式: 所有 API 调用使用 `useDebounce` (1000ms)

#### 目录结构

```
src/
├── components/          # 可复用组件
│   ├── ui/             # shadcn/ui 基础组件
│   ├── dictionary-display/  # 词典功能组件
│   └── translate-display/   # 翻译功能组件
├── lib/                # 核心工具和逻辑
│   ├── ai.ts          # AI 翻译集成
│   ├── config.ts      # 配置管理
│   └── utils.ts       # 通用工具
├── pages/              # 页面组件
└── contexts/           # React Context
```

### 测试策略

- **单元测试**: 使用 Vitest + Testing Library
- **测试环境**: Happy DOM (轻量级浏览器环境)
- **覆盖范围**:
  - `src/lib/` 工具函数的单元测试
  - Tauri 命令的集成测试
  - UI 组件的组件测试
- **命令**:

  ```bash
  pnpm test          # 运行测试
  pnpm test:watch    # 监听模式
  pnpm test:ui       # UI 模式
  ```

### Git 工作流

#### 分支策略

- **主分支**: `master` - 生产就绪代码
- **功能分支**: 从 `master` 创建，完成后合并

#### 提交约定 (Conventional Commits)

- `feat:` - 新功能
- `fix:` - bug 修复
- `chore:` - 构建流程、依赖更新
- `refactor:` - 代码重构
- `docs:` - 文档更新
- `test:` - 测试相关

#### 示例提交信息

```
feat(dict): Add word pronunciation display
fix(updater): Resolve auto-update check error
chore(release): prepare for v0.1.6
```

#### 版本管理

- 遵循语义化版本 (SemVer)
- 使用 `chore(release)` 标签标记版本发布

## 领域背景

### 核心功能

#### 1. 词典模式 (后端处理)

- **流程**: 用户输入 → Tauri 命令 → Rust HTTP 请求 → 有道 API → 显示结果
- **实现**: `src-tauri/src/lib.rs` + `src/components/dictionary-display/`
- **功能**: 定义、短语、同义词、相关词、词形变化

#### 2. 翻译模式 (前端处理)

- **流程**: 用户输入 → 直接浏览器调用 → OpenAI 兼容 API → 显示翻译
- **实现**: `src/lib/ai.ts` + `src/components/translate-display/`
- **配置**: 多模型支持 (OpenAI, DeepSeek 等)

### AI 配置管理

- **存储**: localStorage，键为 `ai_configs`
- **结构**: 模型数组 + 活跃模型 ID
- **默认模型**: DeepSeek V3 (via Volces), GPT-4o Mini
- **UI**: 设置页面 (`src/pages/Settings.tsx`)

## 重要约束

### 技术约束

- **窗口大小**: 固定 800×600px (可调整)
- **开发端口**:
  - Vite: 1420
  - HMR WebSocket: 1421
- **CSP**: 禁用 (`null`) - 允许前端直接调用 API
- **浏览器限制**: `dangerouslyAllowBrowser: true` (仅用于 OpenAI SDK)

### 安全约束

- Tauri 权限在 `src-tauri/capabilities/default.json` 中配置
- 私钥文件不提交到版本控制
- GitHub Releases 用于应用更新

### 构建约束

- 使用 pnpm 作为包管理器
- 前端构建后需要复制到 `dist/` 目录
- Rust 构建使用 `tauri build`

## 外部依赖

### API 服务

- **有道词典 API** (`dict.youdao.com/jsonapi`) - 词典数据源
- **OpenAI 兼容 API** - 翻译服务 (支持多种模型)
  - DeepSeek V3 (通过 Volces)
  - GPT-4o Mini
  - 其他自定义 OpenAI 兼容提供商

### GitHub 集成

- **Releases**: 应用更新分发 (`github.com/sunven/fanyifanyi/releases`)
- **自动更新**: 使用 Tauri Updater 插件

### 开发工具

- **shadcn** - UI 组件生成器
- **@antfu/eslint-config** - 代码规范配置
- **Vitest** - 测试运行器

### 系统要求

- **操作系统**: macOS, Windows, Linux
- **Node.js**: 依赖 Vite 和前端工具链
- **Rust**: 1.70+ (用于 Tauri 构建)
