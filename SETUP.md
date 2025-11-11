# GitHub Actions 设置指南

## 必需配置

在使用自动化发布流程之前，需要在 GitHub 仓库中配置签名密钥。

### 1. 添加 Tauri 签名私钥到 GitHub Secrets

1. **读取私钥内容**

   在本地运行以下命令：

   ```bash
   cat .tauri/fanyifanyi-ci.key
   ```

   会输出类似以下内容：
   ```
   untrusted comment: minisign encrypted secret key
   RWRTY0x...很长的密钥字符串...
   ```

2. **添加到 GitHub Secrets**

   - 访问您的 GitHub 仓库
   - 点击 `Settings` → `Secrets and variables` → `Actions`
   - 点击 `New repository secret`
   - Name: `TAURI_SIGNING_PRIVATE_KEY`
   - Value: 粘贴上一步复制的完整密钥内容（包括注释行）
   - 点击 `Add secret`

3. **添加密钥密码到 GitHub Secrets**

   - 点击 `New repository secret`
   - Name: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
   - Value: `ci-automation` (这是生成密钥时设置的密码)
   - 点击 `Add secret`

### 2. 验证设置

添加完 Secrets 后，可以通过以下方式验证：

1. 在 `Settings` → `Secrets and variables` → `Actions` 页面
2. 应该看到两个 secrets：
   - ✅ `TAURI_SIGNING_PRIVATE_KEY`
   - ✅ `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

## 可选配置

### 启用 GitHub Pages（如果需要自定义更新页面）

如果您想使用 GitHub Pages 而不是 GitHub Releases：

1. 访问 `Settings` → `Pages`
2. Source: 选择 `Deploy from a branch`
3. Branch: 选择 `gh-pages` (在首次发布后自动创建)

**注意**：当前配置使用 GitHub Releases，这是推荐的方式，无需此步骤。

## 首次发布流程

设置完成后，执行首次发布：

```bash
# 1. 确保所有更改已提交
git status

# 2. 运行发布脚本
./scripts/release.sh 0.1.1

# 3. 在提示时确认推送
# 按 'y' 确认

# 4. 查看构建进度
# 访问: https://github.com/sunven/fanyifanyi/actions
```

## 构建时间预估

GitHub Actions 构建时间：

- **macOS 构建**: ~10-15 分钟（两个架构：aarch64 + x86_64）
- **Linux 构建**: ~5-8 分钟
- **Windows 构建**: ~8-12 分钟

总计约 **15-20 分钟**完成所有平台的构建和发布。

## 构建产物

成功发布后，GitHub Release 将包含：

### macOS
- `fanyifanyi_aarch64.app.tar.gz` - Apple Silicon 版本
- `fanyifanyi_aarch64.app.tar.gz.sig` - 签名文件
- `darwin-aarch64.json` - 更新清单
- `fanyifanyi_x86_64.app.tar.gz` - Intel 版本
- `fanyifanyi_x86_64.app.tar.gz.sig` - 签名文件
- `darwin-x86_64.json` - 更新清单
- `*.dmg` - DMG 安装包

### Linux
- `*.AppImage` - AppImage 格式
- `*.AppImage.sig` - 签名文件
- `linux-x86_64.json` - 更新清单
- `*.deb` - Debian 包

### Windows
- `*.msi` - MSI 安装包
- `*.msi.sig` - 签名文件
- `windows-x86_64.json` - 更新清单
- `*.exe` - NSIS 安装包

## 故障排除

### 构建失败

1. **检查 Secrets 配置**
   - 确保密钥内容完整复制（包括注释行）
   - 确保密码正确

2. **查看构建日志**
   - 访问 Actions 页面
   - 点击失败的工作流
   - 查看详细错误信息

3. **常见问题**
   - 密钥格式错误：重新生成密钥
   - 权限不足：检查 GitHub token 权限
   - 依赖安装失败：检查网络连接

### 重新生成签名密钥

如果需要重新生成密钥：

```bash
# 1. 删除旧密钥
rm .tauri/fanyifanyi-ci.key*

# 2. 生成新密钥
cd .tauri
printf "ci-automation\nci-automation\n" | minisign -G -p fanyifanyi-ci.key.pub -s fanyifanyi-ci.key

# 3. 更新 tauri.conf.json 中的公钥
node ../scripts/update-pubkey.cjs

# 4. 更新 GitHub Secrets
# 按照上面的步骤重新添加 TAURI_SIGNING_PRIVATE_KEY
```

## 更新现有应用

用户安装了您的应用后，每次发布新版本时：

1. 应用会自动检查更新（通过配置的 endpoint）
2. 下载对应平台的更新包
3. 验证签名
4. 提示用户安装更新

无需用户手动下载和安装。

## 安全注意事项

⚠️ **重要**：

- **永远不要提交** `.tauri/fanyifanyi-ci.key` 到 git
- 已在 `.gitignore` 中排除：`*.key`（不含 `.pub`）
- 公钥文件 (`.key.pub`) 可以安全提交
- GitHub Secrets 是加密存储的，只有 Actions 可以访问

## 下一步

设置完成后，您就可以：

1. ✅ 使用 `./scripts/release.sh` 一键发布
2. ✅ 自动构建所有平台
3. ✅ 自动创建 GitHub Release
4. ✅ 应用内自动更新功能立即可用

---

如有任何问题，请查看 GitHub Actions 构建日志或提交 Issue。
