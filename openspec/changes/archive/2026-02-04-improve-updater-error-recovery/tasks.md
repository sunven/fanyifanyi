## 1. UpdateContext 状态管理修改

- [x] 1.1 在 `UpdateContext.tsx` 中添加 `isDownloading` 状态
- [x] 1.2 修改 `downloadAndInstall` 函数，添加 `isDownloading` 状态管理
- [x] 1.3 在 `downloadAndInstall` 的 catch 块中添加错误消息映射逻辑
- [x] 1.4 添加 `retryDownload` 方法（清除错误后重试）
- [x] 1.5 添加 `clearError` 方法
- [x] 1.6 更新 `UpdateContextValue` 接口，添加新的状态和方法
- [x] 1.7 更新 `useMemo` 依赖数组，包含新的状态和方法

## 2. Settings 页面 UI 更新

- [x] 2.1 在 `useUpdate()` 解构中添加 `isDownloading` 和 `retryDownload`
- [x] 2.2 创建 `handleRetryDownload` 处理函数
- [x] 2.3 更新主按钮的显示逻辑（根据 hasUpdate、error、isChecking、isDownloading 状态）
- [x] 2.4 添加独立的"重新检查"按钮（当错误时显示）
- [x] 2.5 在错误状态下显示 updateInfo（版本号、更新说明）
- [x] 2.6 为下载进行中状态添加视觉反馈（spinner 或进度提示）
- [x] 2.7 确保按钮在 isChecking 或 isDownloading 时正确禁用

## 3. 测试验证

- [ ] 3.1 构建生产版本并测试正常更新流程
- [ ] 3.2 测试下载失败场景（断开网络后点击更新）
- [ ] 3.3 测试重试下载功能（失败后点击重试）
- [ ] 3.4 测试重复点击按钮防护（快速多次点击）
- [ ] 3.5 测试"重新检查"功能（错误后点击重新检查）
- [ ] 3.6 测试页面刷新后状态保持（error 清除，updateInfo 保留）
- [ ] 3.7 验证所有错误消息的中文显示正确

## 4. 代码审查和发布准备

- [x] 4.1 运行 `npx eslint .` 检查代码规范
- [x] 4.2 运行 `pnpm build` 确保构建成功
- [x] 4.3 更新 CHANGELOG.md（如果项目有）
- [ ] 4.4 提交代码变更
