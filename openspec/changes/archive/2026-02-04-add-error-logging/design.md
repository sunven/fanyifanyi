## Context

### 当前状态

应用目前缺乏系统性的错误日志记录：

1. **前端（React）**:
   - `src/lib/ai.ts` 中的 OpenAI API 调用无错误处理，错误直接抛出
   - `src/components/translate-display/index.tsx` 中仅捕获了 `AbortError`，其他错误被 re-throw
   - 无全局 ErrorBoundary，未捕获的异常会导致白屏

2. **后端（Rust）**:
   - `src-tauri/src/lib.rs` 中仅使用 `map_err()` 转换错误为字符串
   - 无持久化日志，错误无法追溯

### 约束条件

- 保持应用体积最小化
- 日志不应影响应用性能
- 需要支持跨平台（macOS、Linux、Windows）
- 用户数据隐私保护（避免敏感翻译内容写入日志）

### 利益相关者

- 开发者：需要日志排查生产问题
- 用户：日志不应泄露个人隐私

## Goals / Non-Goals

### Goals

1. 统一前后端的日志记录机制
2. 错误日志持久化到本地文件，支持自动轮转
3. 捕获前端未处理的 React 异常，显示友好错误提示
4. 为关键操作（API 调用）添加错误日志
5. 日志格式结构化，便于解析和搜索

### Non-Goals

1. 不实现日志上报服务器（纯本地日志）
2. 不实现详细的性能分析（profiling）
3. 不修改现有的 API 接口契约
4. 不添加日志查看器 UI（用户直接查看日志文件）

## Decisions

### 1. 日志框架选择：tauri-plugin-log

**决策**: 使用官方 `tauri-plugin-log` 插件

**理由**:
- Tauri 官方维护，与 Tauri 生态深度集成
- 支持日志轮转，避免磁盘爆满
- 前后端统一 API
- 跨平台支持完善

**替代方案考虑**:
- Fern: 更强大的 Rust 日志库，但需要额外集成 IPC
- 手动实现: 完全可控，但需要自己处理轮转和 IPC

### 2. 日志输出目标配置

**决策**: 配置三个目标

```rust
// src-tauri/src/lib.rs
tauri_plugin_log::Builder::new()
    .targets([
        Target::new(TargetKind::Stdout),     // 开发环境输出
        Target::new(TargetKind::LogDir {     // 日志文件
            file_name: Some("app.log".to_string())
        }),
        Target::new(TargetKind::Webview),    // 浏览器控制台
    ])
    .level(LogLevel::INFO)
    .build()
```

**理由**:
- `Stdout`: 便于开发调试
- `LogDir`: 持久化日志，文件轮转由插件自动处理
- `Webview`: 开发时可在浏览器控制台查看

### 3. 日志级别策略

**决策**:
- 开发环境: `DEBUG`
- 生产环境: `INFO`

**理由**:
- `DEBUG` 级别过高，生产环境会产生大量日志
- `INFO` 能记录所有错误和警告，同时保持合理的日志量

### 4. 前端错误处理架构

**决策**: 组合使用 ErrorBoundary + 局部错误处理

```
┌─────────────────────────────────────┐
│         ErrorBoundary               │
│  (全局捕获，友好提示，日志记录)        │
└─────────────────────────────────────┘
              │
              ├───▶ 局部 try/catch
              │     (特定操作，精细控制)
              │
              └───▶ 未捕获错误
                    (ErrorBoundary 最后防线)
```

**理由**:
- ErrorBoundary 捕获未处理的 React 错误
- 局部 try/catch 允许针对特定操作记录详细上下文
- 两者结合提供完整的错误覆盖

### 5. 日志工具封装

**决策**: 创建 `src/lib/logger.ts` 封装

```typescript
// src/lib/logger.ts
export const logger = {
  error: (msg: string, err?: unknown) => {
    const context = err instanceof Error ? `\n${err.stack || err.message}` : String(err)
    error(msg + context)
  },
  warn,
  info,
  debug,
  trace,
}
```

**理由**:
- 统一错误格式，自动附加 stack trace
- 便于后续扩展（如添加用户 ID、请求 ID）
- 保持调用点简洁

### 6. 错误抛出前先记录日志

**决策**: 在 `throw new Error` 之前，必须先调用 `logger.error()` 记录日志

```typescript
// 错误模式
try {
  // 可能失败的操作
} catch (err) {
  logger.error('操作失败描述', err)  // 先记录
  throw new Error('用户友好的错误消息')  // 再抛出
}
```

**理由**:
- 确保错误在抛出前已持久化到文件
- 记录完整的 stack trace 和上下文信息
- 避免错误被 ErrorBoundary 捕获时，日志丢失
- 分离"日志记录"和"错误处理"的职责

### 7. Rust 后端错误处理

**决策**: 在 `?` 操作符或 `map_err()` 之前，先用 `log::error!()` 记录错误

```rust
// Rust 错误模式
match operation().await {
    Ok(data) => Ok(data),
    Err(err) => {
        log::error!("词典 API 请求失败: {}", err);
        Err(format!("请求失败: {}", err))
    }
}
```

**理由**:
- 后端错误同样需要持久化
- 与前端日志格式一致，便于排查跨端问题

## Risks / Trade-offs

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 日志文件过大 | 占用磁盘空间 | 启用自动轮转（默认 5MB × 5 文件） |
| 敏感数据泄露 | 用户隐私 | 明确日志级别，避免记录翻译原文 |
| 日志写入失败 | 错误丢失 | 降级到 stderr，不阻塞应用 |
| 首次启动无日志目录 | 日志失败 | Tauri 插件自动创建目录 |
| 性能影响 | 应用变慢 | 异步写入，INFO 级别限制日志量 |

## Open Questions

1. **日志保留策略**: 是否需要按日期归档还是只保留最近 N 个轮转文件？
   - 当前采用默认轮转策略（5 文件循环）

2. **是否需要日志查看入口**: 用户是否有需求在应用内查看日志？
   - 当前方案：用户直接查看日志文件，后续可按需添加 UI

3. **用户能否禁用日志**: 是否提供开关让用户控制日志？
   - 暂不实现，保持简单
