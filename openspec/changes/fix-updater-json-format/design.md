## Context

**Current State:**
- 应用使用 Tauri v2 `plugin-updater` 进行自动更新
- `tauri.conf.json` 中的 endpoints 配置为 `https://github.com/.../releases/download/v{{version}}/{{target}}.json`
- `{{target}}` 变量只返回操作系统名称（`darwin`），而非完整平台标识（`darwin-aarch64`）
- GitHub Action 生成的是 `darwin-aarch64.json`，但应用请求的是 `darwin.json`，导致 404 错误

**Constraints:**
- 必须使用 Tauri v2 updater 插件的官方规范格式
- 签名验证不可禁用，必须包含 `signature` 字段
- 已有用户使用旧版本应用，需要考虑迁移路径

## Goals / Non-Goals

**Goals:**
- 修复 updater JSON 格式，使其符合 Tauri v2 官方规范
- 使用统一的 `latest.json` 包含所有平台信息
- 更新 GitHub Actions 自动生成正确的 JSON 格式
- 保持向后兼容性，让已有用户能平滑升级

**Non-Goals:**
- 修改 Tauri updater 插件本身
- 更新 UI 层的更新提示逻辑（已有实现保持不变）
- 实现自定义更新服务器

## Decisions

### 1. 使用统一 JSON 格式（而非分平台文件）

**Decision:** 使用单一的 `latest.json` 文件包含所有平台信息，而非为每个平台创建单独的 JSON 文件。

**Rationale:**
- Tauri v2 官方文档推荐这种方式
- 简化版本管理，只需维护一个文件
- 更容易添加新平台支持

**Alternatives Considered:**
- **分平台 JSON** (如 `darwin-aarch64.json`): 需要修改端点配置为 `{{target}}-{{arch}}.json`，但这样会增加 Release 文件数量，且不是官方推荐方式

### 2. 使用 `latest` 作为固定标识符

**Decision:** 端点配置使用 `/releases/latest/download/latest.json` 而非版本化路径。

**Rationale:**
- 每次发布时自动覆盖 `latest.json`，无需修改端点配置
- GitHub 的 `latest` release permalink 会自动指向最新版本

**Alternatives Considered:**
- **版本化路径** (`/releases/download/v{{version}}/latest.json`): 需要在代码中动态拼接版本号，增加复杂度

### 3. JSON 字段命名遵循官方规范

**Decision:** 使用 `pub_date` 和 `notes` 而非 `date` 和 `body`。

**Rationale:**
- Tauri v2 官方文档明确要求这些字段名
- 确保与 updater 插件的兼容性

### 4. GitHub Action 在 `generate-updater-json` job 中生成统一 JSON

**Decision:** 修改 workflow，收集所有平台的签名和 URL，生成一个包含所有平台的 `latest.json`。

**Rationale:**
- 所有平台构建完成后统一生成 JSON，确保完整性
- 可以在 JSON 中包含所有已构建平台的信息

## Risks / Trade-offs

### Risk: 旧版本应用无法读取新格式 JSON
**Impact:** 已安装 v0.1.21 及之前版本的用户将无法收到更新通知。

**Mitigation:**
- v0.1.22 应用使用新端点配置，能正确读取 `latest.json`
- 用户手动下载 v0.1.22 安装后，后续更新可正常工作
- 在 Release Notes 中说明用户需要手动更新一次

### Risk: 签名密钥丢失或泄露
**Impact:** 无法发布签名有效的更新，或恶意方可伪造更新。

**Mitigation:**
- 私钥已存储在 GitHub Secrets 中，不会泄露
- 建议用户备份私钥到安全位置
- 如需轮换密钥，Tauri v2 支持运行时设置公钥（可用于密钥轮换）

### Trade-off: 多平台支持增加 JSON 大小
**Impact:** `latest.json` 会包含所有平台信息，文件稍大。

**Acceptable:**
- JSON 文件通常 < 5KB，对网络影响可忽略
- Tauri updater 会自动提取当前平台的信息，不会浪费内存

## Migration Plan

### 部署步骤

1. **修改 `tauri.conf.json`**
   ```json
   "endpoints": [
     "https://github.com/sunven/fanyifanyi/releases/latest/download/latest.json"
   ]
   ```

2. **修改 GitHub Actions workflow**
   - 更新 `generate-updater-json` job 生成统一 JSON
   - 为每个已构建平台添加到 `platforms` 对象
   - 使用正确的字段名（`pub_date`, `notes`）

3. **手动修复现有 Releases**
   - 为 v0.1.21 Release 生成正确的 `latest.json`
   - 使用 GitHub CLI 或 Web UI 上传

4. **发布 v0.1.22**
   - 使用新的 workflow 构建
   - 验证生成的 `latest.json` 格式正确

### 回滚策略

如果新版本出现问题：
1. 重新发布使用旧格式的 JSON 文件（`darwin-aarch64.json`）
2. 回滚 `tauri.conf.json` 中的 endpoints 配置
3. 通知用户手动下载特定版本

## Open Questions

1. **是否需要同时支持 Intel macOS？**
   - 当前 workflow 中 `darwin-x86_64` 构建被注释掉
   - 如果需要启用，需确保 `latest.json` 包含该平台

2. **Release Notes 内容来源**
   - 当前 workflow 使用 `git-cliff` 生成 Release Notes
   - 需确认 JSON 中的 `notes` 字段应包含完整 notes 还是简短摘要
   - **建议**: 使用完整 notes，Tauri updater 插件会正确显示

3. **v0.1.21 是否需要手动补发 `latest.json`？**
   - 如果不补发，v0.1.21 用户需要手动更新到 v0.1.22
   - **建议**: 补发，减少用户手动操作
