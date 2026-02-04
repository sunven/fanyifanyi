## Why

应用内更新功能报错 "Could not fetch a valid release JSON from the remote"。当前 updater 配置使用了错误的变量模板（`{{target}}` 只返回操作系统名如 `darwin`，而非 `darwin-aarch64`），导致请求的 JSON 文件名与实际生成的文件名不匹配。

## What Changes

- **BREAKING**: 修改 `tauri.conf.json` 中的 updater endpoints 配置，从分平台 JSON 模式改为统一 JSON 模式
- 更新 GitHub Actions workflow，生成符合 Tauri v2 官方规范的 `latest.json` 格式
- 修正 JSON 字段名称（`date` → `pub_date`，`body` → `notes`）

## Capabilities

### New Capabilities
- `app-updater`: 应用内自动更新功能，支持检查更新、下载和安装新版本

### Modified Capabilities
- 无

## Impact

- `src-tauri/tauri.conf.json`: 修改 `plugins.updater.endpoints` 配置
- `.github/workflows/release.yml`: 修改 `generate-updater-json` job 生成统一 JSON
- 已发布的 GitHub Releases 需要重新生成 `latest.json` 文件
- 用户需要更新到支持新格式版本后才能继续接收更新
