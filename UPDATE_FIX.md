# 更新下载失败问题修复

## 问题诊断

下载更新失败的原因：

1. **签名文件缺失**：GitHub Release 中没有上传 `.sig` 签名文件
2. **更新配置错误**：`darwin-aarch64.json` 中 `signature` 字段为空字符串
3. **验证失败**：Tauri updater 要求验证签名才能安装更新

### 当前状态

检查 v0.1.7 release：
```bash
curl -sL "https://github.com/sunven/fanyifanyi/releases/download/v0.1.7/darwin-aarch64.json"
```

输出：
```json
{
  "version": "0.1.7",
  "date": "2025-11-14T10:19:02Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "",  ← 签名为空！
      "url": "https://github.com/sunven/fanyifanyi/releases/download/v0.1.7/fanyifanyi_aarch64.app.tar.gz"
    }
  }
}
```

## 根本原因

**GitHub Actions 工作流中的签名文件查找逻辑错误：**

原代码（第 122 行）：
```bash
if [ -f "$APP_PATH.tar.gz.sig" ]; then
```

问题：
- `$APP_PATH` 是 `.app` 目录的路径
- 但 Tauri 为更新生成的是 `.app.tar.gz` 文件及其签名
- 路径拼接错误导致找不到签名文件

## 解决方案

### 1. 修复工作流 (`.github/workflows/release.yml`)

更新的逻辑：

```bash
# 查找 Tauri 自动生成的 updater tarball
TARBALL=$(find src-tauri/target/${{ matrix.target }}/release/bundle/macos -name "*.app.tar.gz" ! -name "*.sig" | head -n 1)

if [ -f "$TARBALL" ]; then
  # 上传 tarball
  cp "$TARBALL" "fanyifanyi_${{ matrix.arch }}.app.tar.gz"
  gh release upload ${{ github.ref_name }} "fanyifanyi_${{ matrix.arch }}.app.tar.gz" --clobber
  
  # 查找并上传签名文件（应该在同一目录）
  SIG_SOURCE="${TARBALL}.sig"
  if [ -f "$SIG_SOURCE" ]; then
    cp "$SIG_SOURCE" "fanyifanyi_${{ matrix.arch }}.app.tar.gz.sig"
    gh release upload ${{ github.ref_name }} "fanyifanyi_${{ matrix.arch }}.app.tar.gz.sig" --clobber
  fi
fi
```

**关键改进：**
- 直接查找 Tauri 生成的 `.app.tar.gz` 文件
- 签名文件路径为 `${TARBALL}.sig`（紧邻 tarball）
- 添加详细的调试输出以便排查问题

### 2. 验证签名密钥配置

检查 GitHub Secrets 是否配置：
```
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

这些密钥在工作流的第 84-97 行被使用。

## 测试步骤

### 创建测试版本

1. **更新版本号**（示例：v0.1.8-test）
   ```bash
   # 更新 src-tauri/tauri.conf.json
   # "version": "0.1.8"
   
   # 更新 src-tauri/Cargo.toml
   # version = "0.1.8"
   ```

2. **提交并打 tag**
   ```bash
   git add .
   git commit -m "test: 修复更新签名问题 v0.1.8"
   git tag v0.1.8-test
   git push origin main
   git push origin v0.1.8-test
   ```

3. **等待 GitHub Actions 构建完成**
   
   查看工作流输出，确认：
   - ✅ "Found updater tarball: ..."
   - ✅ "✓ Uploaded tarball"
   - ✅ "✓ Uploaded signature file"

4. **验证 Release 资源**
   ```bash
   # 检查是否有签名文件
   curl -I "https://github.com/sunven/fanyifanyi/releases/download/v0.1.8-test/fanyifanyi_aarch64.app.tar.gz.sig"
   
   # 检查更新配置
   curl -sL "https://github.com/sunven/fanyifanyi/releases/download/v0.1.8-test/darwin-aarch64.json"
   ```

   期望输出：
   ```json
   {
     "version": "0.1.8",
     "platforms": {
       "darwin-aarch64": {
         "signature": "untrusted comment: ...\n...",  ← 应该有内容
         "url": "..."
       }
     }
   }
   ```

5. **在应用中测试更新**
   
   - 使用 v0.1.7 版本打开应用
   - 进入设置页面
   - 点击"检查更新"
   - 应该能发现 v0.1.8 版本
   - 点击"立即更新"
   - 下载和安装应该成功

## 可能的问题

### 问题 1：仍然找不到签名文件

**症状**：工作流日志显示 "⚠️ Warning: Signature file not found"

**原因**：
- 签名密钥未配置或错误
- Tauri 版本不支持自动生成 updater tarball
- 构建配置有误

**排查**：
1. 检查 GitHub Secrets 配置
2. 查看完整的工作流日志
3. 检查 `ls -lah` 输出，确认目录中有哪些文件

**临时方案**：手动签名
```bash
# 在本地构建后手动签名
pnpm tauri signer sign \
  src-tauri/target/aarch64-apple-darwin/release/bundle/macos/*.app.tar.gz \
  --private-key .tauri/fanyifanyi.key
```

### 问题 2：签名验证失败

**症状**：下载完成后提示"验证失败"

**原因**：
- 签名内容与公钥不匹配
- 公钥配置错误（`tauri.conf.json` 中的 `pubkey`）

**解决**：
1. 确认 `tauri.conf.json` 中的公钥与签名私钥匹配
2. 重新生成密钥对并更新配置

### 问题 3：下载后无法安装

**症状**：下载成功，但安装失败

**原因**：
- macOS 安全策略阻止
- 文件权限问题

**解决**：
1. 检查应用日志
2. 在 macOS 系统偏好设置中允许应用
3. 使用 `codesign` 验证签名

## 后续优化

1. **添加更详细的错误日志**
   - 在更新失败时显示具体错误信息
   - 区分网络错误、验证错误和安装错误

2. **改进用户体验**
   - 提供手动下载链接
   - 显示更新变更日志
   - 支持跳过特定版本

3. **自动化测试**
   - 在 CI 中验证签名文件生成
   - 测试更新流程的完整性

## 参考文档

- [Tauri Updater 插件文档](https://v2.tauri.app/plugin/updater/)
- [Tauri 签名文档](https://v2.tauri.app/distribute/sign/)
- [GitHub Actions 工作流](.github/workflows/release.yml)
- [签名设置指南](scripts/SIGNING_SETUP.md)
