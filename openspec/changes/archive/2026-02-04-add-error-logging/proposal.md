## Why

程序发生错误时（如 `throw new Error`、`console.error`）没有持久化日志记录，尤其在生产环境中，无法排查和分析问题。目前的错误处理存在以下问题：前端 React 组件的错误未被全局捕获，Rust 后端的错误仅通过 `map_err()` 转换为字符串返回，日志未写入文件，无法追溯问题根源。

## What Changes

1. 添加 `tauri-plugin-log` 依赖，实现前后端统一的日志记录
2. 在 Rust 后端初始化日志插件，配置日志输出到文件（支持自动轮转）
3. 创建前端 `ErrorBoundary` 组件，捕获未处理的 React 异常
4. 封装前端日志工具 `logger.ts`，提供 `error()`、`warn()`、`info()` 等方法
5. 在关键位置（AI 翻译、词典查询）集成错误日志记录
6. 配置日志级别：开发环境为 `DEBUG`，生产环境为 `INFO`

## Capabilities

### New Capabilities
- `error-logging`: 前端和后端的统一错误日志记录能力，包括日志持久化、错误边界捕获、日志轮转

### Modified Capabilities
- 无

## Impact

- **代码变更**:
  - `src-tauri/Cargo.toml`: 添加 `tauri-plugin-log` 和 `log` 依赖
  - `src-tauri/src/lib.rs`: 初始化日志插件，配置 targets 和日志级别
  - `src-tauri/capabilities/default.json`: 添加 `log:default` 权限
  - `package.json`: 添加 `@tauri-apps/plugin-log` 前端依赖
  - `src/lib/logger.ts`: 新建，前端日志封装工具
  - `src/components/ErrorBoundary.tsx`: 新建，React 错误边界组件
  - `src/main.tsx`: 使用 `ErrorBoundary` 包装应用
  - `src/lib/ai.ts`: 集成 OpenAI API 调用的错误日志
  - `src/components/translate-display/index.tsx`: 集成翻译组件的错误日志

- **依赖变更**: 新增 2 个 Rust 依赖、1 个前端依赖
- **日志文件位置**:
  - macOS: `~/Library/Logs/fanyifanyi/app.log`
  - Linux: `~/.local/share/fanyifanyi/logs/app.log`
  - Windows: `%APPDATA%/fanyifanyi/logs/app.log`
