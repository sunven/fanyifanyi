## 1. Dependencies Setup

- [x] 1.1 Add `tauri-plugin-log = "2.8.0"` to `src-tauri/Cargo.toml`
- [x] 1.2 Add `log = "^0.4"` to `src-tauri/Cargo.toml` for Rust logging macros
- [x] 1.3 Run `pnpm add @tauri-apps/plugin-log` to install frontend bindings

## 2. Backend Configuration

- [x] 2.1 Add `log:default` permission to `src-tauri/capabilities/default.json`
- [x] 2.2 Update `src-tauri/src/lib.rs` to initialize tauri-plugin-log with targets
- [x] 2.3 Configure log targets: Stdout, LogDir (app.log), and Webview
- [x] 2.4 Set log level to INFO for production

## 3. Frontend Logger Utility

- [x] 3.1 Create `src/lib/logger.ts` with error, warn, info, debug, trace functions
- [x] 3.2 Implement error context extraction (stack trace, message)
- [x] 3.3 Test logger imports and exports (verified via pnpm build)

## 4. Error Boundary Component

- [x] 4.1 Create `src/components/ErrorBoundary.tsx` class component
- [x] 4.2 Implement `getDerivedStateFromError` for error state
- [x] 4.3 Implement `componentDidCatch` for error logging
- [x] 4.4 Add user-friendly error UI (Chinese text)
- [x] 4.5 Integrate ErrorBoundary in `src/main.tsx`

## 5. Integration Points

- [x] 5.1 Update `src/lib/ai.ts` - wrap OpenAI API call in try/catch, call logger.error BEFORE throw
- [x] 5.2 Update `src/components/translate-display/index.tsx` - add logger.error BEFORE throw in catch block
- [x] 5.3 Update `src-tauri/src/lib.rs` get_dict_data - add log::error!() BEFORE returning Err
- [x] 5.4 Ensure all error paths have logging before propagating the error

## 6. Verification

- [x] 6.1 Run `pnpm build` to verify TypeScript compilation
- [x] 6.2 Run `cargo check` to verify Rust compilation
- [ ] 6.3 Run in dev mode and trigger an error to verify logging works
- [ ] 6.4 Check log file location for macOS: `~/Library/Logs/fanyifanyi/app.log`

## 7. Cleanup

- [x] 7.1 Remove any temporary console.log statements added during testing (removed from translate-display)
- [ ] 7.2 Verify all TODO comments are addressed
