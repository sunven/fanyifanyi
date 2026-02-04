## Context

**Current State:**
- 应用使用 `UpdateContext` 管理更新状态，包含 `hasUpdate`, `updateInfo`, `updateHandle`, `isChecking`, `error` 等状态
- 下载失败时只设置 `error`，但 `updateInfo` 和 `updateHandle` 保持不变（已经是期望行为）
- 问题是 UI 层未正确处理错误状态，导致用户看到"已是最新版本"
- `updater.ts` 中已有部分错误消息映射（网络、404），但下载失败时未使用

**Constraints:**
- 必须使用 Tauri v2 `plugin-updater` 和 `plugin-process`
- 不引入额外状态管理库（继续使用 React Context + hooks）
- 保持现有 API 接口不变，向后兼容
- 不改变现有 `isDismissed` 逻辑

**Stakeholders:**
- 最终用户：需要清晰的错误提示和重试机制
- 开发者：需要日志信息调试问题

## Goals / Non-Goals

**Goals:**
- 下载失败后保留 `updateInfo`，用户可以重试
- 提供明确的"重试下载"按钮和"重新检查"选项
- 改进错误消息的用户体验（映射技术错误到友好提示）
- 防止重复下载请求

**Non-Goals:**
- 不添加自动重试机制（仅手动重试）
- 不分离 checkError 和 downloadError（保持单一 error 状态）
- 不修改现有的"跳过版本"逻辑
- 不添加下载进度百分比显示（可后续增强）

## Decisions

### 1. 新增 `isDownloading` 状态防止重复下载

**Decision:** 在 `UpdateContext` 中添加 `isDownloading` 状态，下载进行中时禁用按钮。

**Rationale:**
- 当前实现可能允许用户连续点击触发多次下载
- `isDownloading` 提供明确的状态判断
- UI 可以根据此状态禁用按钮并显示加载动画

**Implementation:**
```typescript
const [isDownloading, setIsDownloading] = useState(false)

const downloadAndInstall = useCallback(async () => {
  if (!updateHandle || isDownloading) return

  setIsDownloading(true)
  try {
    await updateHandle.downloadAndInstall()
    await relaunchApp()
  } catch (err) {
    // 错误处理
  } finally {
    setIsDownloading(false)
  }
}, [updateHandle, isDownloading])
```

### 2. 扩展 `downloadAndInstall` 的错误消息映射

**Decision:** 在 `UpdateContext.downloadAndInstall` 的 catch 块中添加与 `checkForUpdate` 类似的错误映射逻辑。

**Rationale:**
- 当前只显示 "Unknown error"，对用户没有帮助
- `updater.ts` 中已有错误映射模式，可以复用
- 需要区分可重试错误（网络）和不可重试错误（签名）

**Alternatives Considered:**
- **在 Tauri 层处理**：不可行，因为错误来自 `updateHandle.downloadAndInstall()`，在 Rust 层无法细粒度映射
- **统一错误处理函数**：考虑过，但 `checkForUpdate` 和 `downloadAndInstall` 的错误场景不同，分开更清晰

**Implementation:**
```typescript
catch (err) {
  logger.error('downloadAndInstall', err)
  let message = 'Unknown error'
  if (err instanceof Error) {
    if (err.message.includes('network') || err.message.includes('fetch')) {
      message = '网络连接失败，请检查网络设置'
    } else if (err.message.includes('signature') || err.message.includes('verify')) {
      message = '更新包签名验证失败，请联系开发者'
    } else if (err.message.includes('404') || err.message.includes('Not Found')) {
      message = '未找到更新服务器或文件，请稍后再试'
    } else {
      message = `更新失败: ${err.message}`
    }
  }
  setError(message)
}
```

### 3. 新增 `retryDownload` 方法

**Decision:** 添加独立的 `retryDownload` 方法，清除错误后重新执行下载。

**Rationale:**
- 语义清晰：`retryDownload` vs `downloadAndInstall`
- 可以在 retry 时清除之前的错误状态
- 复用现有的 `updateHandle`

**Alternatives Considered:**
- **复用 `downloadAndInstall`**：UI 层需要先调用 `setError(null)`，容易遗漏
- **在 `downloadAndInstall` 内部自动清除错误**：但首次下载时不应清除检查阶段的错误

**Implementation:**
```typescript
const retryDownload = useCallback(async () => {
  setError(null)  // 清除之前的错误
  await downloadAndInstall()
}, [downloadAndInstall])
```

### 4. 添加 `clearError` 方法

**Decision:** 提供 `clearError` 方法，允许用户在"重新检查"前清除错误。

**Rationale:**
- 分离"清除错误"和"重新检查"两个操作
- `checkUpdate` 已经在开始时清除错误，但显式调用更清晰
- 未来可能需要在其他场景清除错误

**Implementation:**
```typescript
const clearError = useCallback(() => {
  setError(null)
}, [])
```

### 5. 确认下载失败保留状态是现有行为

**Finding:** 当前实现中，`downloadAndInstall` 失败后：
- `hasUpdate` 保持 `true` ✓
- `updateInfo` 保持不变 ✓
- `updateHandle` 保持不变 ✓
- 只有 `error` 被设置

**Conclusion:** 状态保留逻辑已存在，无需修改。问题在于 UI 层未正确处理此状态。

## Risks / Trade-offs

### Risk: `isDownloading` 状态可能不同步
**Scenario:** 如果下载在后台失败（如 Tauri 进程崩溃），`isDownloading` 可能卡在 `true`。

**Mitigation:**
- 在 `finally` 块中确保 `setIsDownloading(false)` 总是执行
- 添加超时机制（可选，Tauri updater 本身有超时）

### Risk: 错误消息映射可能遗漏某些错误类型
**Scenario:** Tauri updater 更新后可能引入新的错误消息格式。

**Mitigation:**
- 保留 `err.message` 作为 fallback
- 添加日志记录完整错误对象
- 后续可以根据实际错误反馈更新映射

### Trade-off: 单一 error 状态 vs 分离 checkError/downloadError
**Decision:** 保持单一 `error` 状态。

**Rationale:**
- 更简单，UI 只需显示一个错误区域
- 用户通常只关心"出错了"，不关心是哪个阶段
- 如果需要，可以根据 `hasUpdate` 推断是哪个阶段的错误

**Cost:**
- 无法同时显示"检查失败"和"下载失败"两个错误（实际场景中不太需要）

### Trade-off: 不自动重试
**Decision:** 仅提供手动重试按钮。

**Rationale:**
- 自动重试可能浪费用户带宽
- 用户可能想要先解决网络问题再重试
- 符合用户对桌面应用的预期

**Cost:**
- 用户体验略差（需要多一次点击）
- 但可以提供更明确的反馈

## Migration Plan

### 部署步骤

1. **修改 `src/contexts/UpdateContext.tsx`**
   - 添加 `isDownloading` 状态
   - 修改 `downloadAndInstall` 添加错误映射
   - 添加 `retryDownload` 方法
   - 添加 `clearError` 方法（可选）
   - 导出新的状态和方法

2. **修改 `src/pages/Settings.tsx`**
   - 添加 `isDownloading` 到解构的状态中
   - 添加 `retryDownload` 到解构的方法中
   - 更新按钮逻辑：
     - `isChecking` 时显示"检查中..."（禁用）
     - `hasUpdate && !error && !isDownloading` 时显示"立即更新到 v{x.x.x}"
     - `hasUpdate && error` 时显示"重试下载"
     - `!hasUpdate && !error` 时显示"检查更新"
     - `!hasUpdate && error` 时显示"重新检查"
   - 添加独立的"重新检查"按钮（始终可用，除非检查中）

3. **测试场景**
   - 正常更新流程
   - 下载失败（断网测试）
   - 签名验证失败（需要构造场景）
   - 重复点击按钮测试
   - 刷新页面后状态保持

### 回滚策略

如果新版本出现问题：
1. 回滚到现有实现即可（不涉及数据迁移）
2. 用户可能看到的错误：临时性的"Unknown error"
3. 不影响核心更新功能

## Open Questions

1. **是否需要添加下载进度显示？**
   - 当前 `UpdateHandle` 支持 `onProgress` 回调
   - 可以在后续增强中添加
   - 建议：本变更不包含，保持聚焦

2. **是否需要持久化错误状态到 localStorage？**
   - 当前 error 状态不持久化
   - 刷新页面后 error 会丢失（符合预期）
   - 建议：不持久化，用户看到错误后通常会立即操作

3. **是否需要添加"取消下载"功能？**
   - Tauri updater 是否支持取消需要确认
   - 建议：不包含，下载通常很快完成
