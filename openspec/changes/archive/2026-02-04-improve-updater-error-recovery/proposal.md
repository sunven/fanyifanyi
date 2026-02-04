## Why

当用户点击"更新到 xxx"后如果下载失败（如网络问题、签名验证失败等），当前实现只显示 "Unknown error" 且不提供重试机制。更严重的是，失败后用户刷新页面会显示"当前已是最新版本"，导致用户无法重试更新。这降低了应用更新的可靠性。

## What Changes

- 下载失败后**保留** `updateInfo` 和 `updateHandle`，让用户知道有可用的更新版本
- 错误状态**不自动清除**，必须由用户明确操作（重试/重新检查/跳过）
- 提供明确的**重试下载**按钮，允许用户在失败后手动重试
- 改进错误消息的可读性，将 Tauri updater 的错误映射为用户友好的提示
- 添加下载进行中状态，防止用户重复点击触发多次下载

## Capabilities

### Modified Capabilities
- `app-updater`: 添加错误恢复和重试机制
  - 下载失败时保留更新信息
  - 提供手动重试操作
  - 改进错误消息的用户体验

## Impact

- `src/contexts/UpdateContext.tsx`: 修改状态管理和错误处理逻辑
- `src/lib/updater.ts`: 改进错误消息映射
- `src/pages/Settings.tsx`: 更新 UI 以支持重试和更好的错误显示
- 状态机新增 `isDownloading` 状态防止重复下载
