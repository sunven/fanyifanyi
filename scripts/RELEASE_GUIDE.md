# 发布流程指南

本文档说明如何构建、签名和发布 fanyifanyi 应用的新版本，包括完整的版本号管理规范和更新清单生成流程。

## 前置要求

### 1. 开发环境

- Node.js 和 pnpm
- Rust 和 Cargo
- Tauri CLI (`@tauri-apps/cli`)
- 平台特定的构建工具：
  - **macOS**: Xcode Command Line Tools
  - **Linux**: 标准构建工具 (gcc, make 等)
  - **Windows**: Visual Studio Build Tools

### 2. 签名密钥

首次发布前，需要生成签名密钥对：

```bash
./scripts/setup-signing.sh
```

详见 [SIGNING_SETUP.md](./SIGNING_SETUP.md)

## 完整发布流程概览

发布新版本的完整流程包括以下步骤：

```
1. 更新版本号 → 2. 更新 CHANGELOG → 3. 构建和签名 → 4. 测试 →
5. 生成清单 → 6. 上传文件 → 7. 配置端点 → 8. 测试更新 → 9. 发布公告
```

**预计时间：** 30-60 分钟（首次可能需要更长时间）

**前置要求：**

- ✅ 已生成签名密钥对
- ✅ 已配置构建环境
- ✅ 已测试所有功能
- ✅ 已准备好更新说明

## 发布流程详细步骤

### 步骤 1: 更新版本号

编辑以下文件中的版本号：

1. `package.json` - 前端版本
2. `src-tauri/tauri.conf.json` - 应用版本
3. `src-tauri/Cargo.toml` - Rust 包版本

确保三个文件中的版本号一致。

```bash
# 使用 npm version 命令可以自动更新 package.json
pnpm version patch  # 或 minor, major
```

### 步骤 2: 更新 CHANGELOG

在 `CHANGELOG.md` 中添加新版本的更新说明：

```markdown
## [0.2.0] - 2025-11-10

### 新增

- 添加了自动更新功能
- 新增设置页面的更新管理

### 修复

- 修复了某个 bug

### 改进

- 优化了性能
```

### 步骤 3: 构建和签名发布版本

#### 3.1 使用构建脚本

运行自动化构建脚本：

```bash
./scripts/build-release.sh
```

此脚本会自动执行以下步骤：

1. ✅ 清理旧的构建产物
2. ✅ 安装前端依赖
3. ✅ 构建前端资源
4. ✅ 构建 Tauri 应用
5. ✅ 使用私钥签名更新包
6. ✅ 生成构建产物清单
7. ✅ 验证签名文件

#### 3.2 手动构建步骤

如果需要手动构建，按以下步骤操作：

**1. 安装依赖**

```bash
pnpm install
```

**2. 构建前端**

```bash
pnpm build
```

**3. 构建 Tauri 应用**

```bash
pnpm tauri build
```

**4. 签名更新包**

构建过程会自动签名，但也可以手动签名：

```bash
# macOS
pnpm tauri signer sign \
  src-tauri/target/release/bundle/macos/fanyifanyi.app.tar.gz \
  --private-key .tauri/fanyifanyi.key

# Linux
pnpm tauri signer sign \
  src-tauri/target/release/bundle/appimage/fanyifanyi_0.2.0_amd64.AppImage \
  --private-key .tauri/fanyifanyi.key

# Windows
pnpm tauri signer sign \
  src-tauri/target/release/bundle/msi/fanyifanyi_0.2.0_x64_en-US.msi \
  --private-key .tauri/fanyifanyi.key
```

签名文件会生成在同一目录，扩展名为 `.sig`。

#### 3.3 构建产物位置

**macOS:**

```
src-tauri/target/release/bundle/macos/
├── fanyifanyi.app.tar.gz          # 更新包（用于自动更新）
├── fanyifanyi.app.tar.gz.sig      # 签名文件
└── fanyifanyi_0.2.0_x64.dmg       # 安装镜像（用于首次安装）
```

**Linux:**

```
src-tauri/target/release/bundle/
├── appimage/
│   ├── fanyifanyi_0.2.0_amd64.AppImage      # 更新包
│   └── fanyifanyi_0.2.0_amd64.AppImage.sig  # 签名文件
└── deb/
    └── fanyifanyi_0.2.0_amd64.deb           # Debian 安装包
```

**Windows:**

```
src-tauri/target/release/bundle/
├── msi/
│   ├── fanyifanyi_0.2.0_x64_en-US.msi       # 更新包（MSI 安装程序）
│   └── fanyifanyi_0.2.0_x64_en-US.msi.sig   # 签名文件
└── nsis/
    ├── fanyifanyi_0.2.0_x64-setup.exe       # NSIS 安装程序
    └── fanyifanyi_0.2.0_x64-setup.exe.sig   # 签名文件
```

#### 3.4 验证构建产物

**检查文件是否存在：**

```bash
# macOS
ls -lh src-tauri/target/release/bundle/macos/

# Linux
ls -lh src-tauri/target/release/bundle/appimage/
ls -lh src-tauri/target/release/bundle/deb/

# Windows
dir src-tauri\target\release\bundle\msi\
dir src-tauri\target\release\bundle\nsis\
```

**验证签名文件：**

```bash
# 检查签名文件是否存在
find src-tauri/target/release/bundle -name "*.sig"

# 验证签名（使用公钥）
pnpm tauri signer verify \
  src-tauri/target/release/bundle/macos/fanyifanyi.app.tar.gz \
  --public-key .tauri/fanyifanyi.key.pub
```

**验证清单：**

- ✅ 所有平台的更新包都已生成
- ✅ 每个更新包都有对应的 `.sig` 签名文件
- ✅ 签名验证通过
- ✅ 文件大小合理（不为 0）

#### 3.5 签名故障排除

**问题：找不到私钥**

```bash
# 检查私钥是否存在
ls -la .tauri/fanyifanyi.key

# 如果不存在，重新生成
./scripts/setup-signing.sh
```

**问题：密码错误**

确保使用正确的私钥密码。如果忘记密码，需要重新生成密钥对。

**问题：签名验证失败**

```bash
# 检查公钥是否正确
cat .tauri/fanyifanyi.key.pub

# 检查 tauri.conf.json 中的公钥
grep pubkey src-tauri/tauri.conf.json
```

#### 3.6 跨平台构建注意事项

**macOS 构建：**

- 需要在 macOS 系统上构建
- 支持 Intel (x86_64) 和 Apple Silicon (aarch64)
- 需要 Xcode Command Line Tools

**Linux 构建：**

- 可以在 Linux 系统上构建
- 生成 AppImage 和 .deb 包
- 需要标准构建工具 (gcc, make 等)

**Windows 构建：**

- 需要在 Windows 系统上构建
- 生成 MSI 和 NSIS 安装程序
- 需要 Visual Studio Build Tools

**使用 CI/CD 自动构建多平台：**

参见本文档后面的"使用 CI/CD 自动构建"章节。

### 步骤 4: 测试构建产物

在目标平台上测试安装包：

1. 安装应用
2. 验证功能正常
3. 检查版本号是否正确
4. 测试更新检查功能（可选）

### 步骤 5: 生成和上传更新清单

#### 5.1 生成更新清单

更新清单是一个 JSON 文件，包含最新版本信息和各平台的下载链接。

**运行清单生成脚本：**

```bash
# 使用默认 URL
node scripts/generate-manifest.js

# 或指定自定义 URL
UPDATE_BASE_URL=https://releases.example.com/fanyifanyi node scripts/generate-manifest.js

# 指定版本号（默认从 package.json 读取）
VERSION=0.2.0 UPDATE_BASE_URL=https://releases.example.com node scripts/generate-manifest.js
```

**生成的文件：**

- `update-manifest.json` - Tauri 更新清单（需上传到服务器）
- `update-manifest-{version}-report.json` - 详细构建报告（用于记录）
- `build-manifest-{version}.txt` - 构建产物清单（用于验证）

#### 5.2 更新清单格式说明

生成的 `update-manifest.json` 格式：

```json
{
  "version": "0.2.0",
  "notes": "修复了若干 bug，添加了新功能",
  "pub_date": "2025-11-10T12:00:00Z",
  "platforms": {
    "darwin-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUldUTE...",
      "url": "https://releases.example.com/fanyifanyi-0.2.0-x64.app.tar.gz"
    },
    "darwin-aarch64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUldUTE...",
      "url": "https://releases.example.com/fanyifanyi-0.2.0-aarch64.app.tar.gz"
    },
    "linux-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUldUTE...",
      "url": "https://releases.example.com/fanyifanyi-0.2.0-amd64.AppImage"
    },
    "windows-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUldUTE...",
      "url": "https://releases.example.com/fanyifanyi-0.2.0-x64-setup.msi"
    }
  }
}
```

**字段说明：**

- `version` - 新版本号（必须大于当前版本）
- `notes` - 更新说明（从 CHANGELOG.md 提取）
- `pub_date` - 发布日期（ISO 8601 格式）
- `platforms` - 各平台的更新包信息
  - `signature` - 更新包的签名（base64 编码）
  - `url` - 更新包的下载链接（必须是 HTTPS）

#### 5.3 验证更新清单

在上传前验证清单文件：

```bash
# 检查 JSON 格式
cat update-manifest.json | jq .

# 验证必需字段
jq '.version, .platforms | keys' update-manifest.json

# 检查签名是否存在
jq '.platforms[] | .signature' update-manifest.json
```

**验证清单：**

- ✅ 版本号格式正确（遵循语义化版本）
- ✅ 所有平台都有签名
- ✅ 所有 URL 使用 HTTPS
- ✅ 更新说明清晰明了
- ✅ 发布日期正确

#### 5.4 自定义更新说明

默认情况下，脚本从 `CHANGELOG.md` 提取更新说明。也可以手动指定：

```bash
# 使用自定义更新说明
RELEASE_NOTES="修复了关键 bug，提升了性能" node scripts/generate-manifest.js
```

或编辑生成的 `update-manifest.json` 文件：

```json
{
  "version": "0.2.0",
  "notes": "## 新增功能\n- 自动更新\n- 设置管理\n\n## Bug 修复\n- 修复了翻译问题",
  "pub_date": "2025-11-10T12:00:00Z",
  "platforms": { ... }
}
```

**更新说明支持 Markdown 格式。**

### 步骤 6: 上传构建产物

将构建产物上传到发布服务器。

#### 选项 A: GitHub Releases

1. 创建新的 GitHub Release
2. 上传所有平台的安装包和签名文件
3. 上传更新清单 JSON

```bash
# 使用 GitHub CLI
gh release create v0.2.0 \
  src-tauri/target/release/bundle/macos/fanyifanyi.app.tar.gz \
  src-tauri/target/release/bundle/macos/fanyifanyi.app.tar.gz.sig \
  update-manifest.json \
  --title "v0.2.0" \
  --notes-file CHANGELOG.md
```

#### 选项 B: 自建服务器

使用 SCP、SFTP 或其他方式上传文件：

```bash
# 示例：使用 rsync
rsync -avz src-tauri/target/release/bundle/ user@server:/var/www/releases/
rsync -avz update-manifest.json user@server:/var/www/updates/
```

#### 选项 C: 云存储 (S3/OSS)

使用云服务提供商的 CLI 工具：

```bash
# AWS S3 示例
aws s3 sync src-tauri/target/release/bundle/ s3://your-bucket/releases/
aws s3 cp update-manifest.json s3://your-bucket/updates/
```

### 步骤 7: 配置更新端点

确保 `src-tauri/tauri.conf.json` 中的更新端点正确：

```json
{
  "bundle": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://your-server.com/updates/{{target}}/{{current_version}}"
      ],
      "pubkey": "YOUR_PUBLIC_KEY"
    }
  }
}
```

更新端点应返回更新清单 JSON。

### 步骤 8: 测试自动更新

1. 安装旧版本的应用
2. 启动应用，检查是否检测到更新
3. 点击"立即更新"，验证下载和安装流程
4. 确认应用成功更新到新版本

### 步骤 9: 发布公告

- 在项目网站发布更新公告
- 在社交媒体分享新版本
- 通知用户更新可用

## 跨平台构建

### 在 macOS 上构建

```bash
# 构建 macOS 版本（支持 Intel 和 Apple Silicon）
./scripts/build-release.sh
```

### 在 Linux 上构建

```bash
# 构建 Linux 版本
./scripts/build-release.sh
```

### 在 Windows 上构建

```powershell
# 使用 PowerShell 或 Git Bash
./scripts/build-release.sh
```

### 使用 CI/CD 自动构建

可以使用 GitHub Actions 或其他 CI/CD 服务自动构建多平台版本。

示例 GitHub Actions 工作流：

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Setup Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable

      - name: Install dependencies
        run: pnpm install

      - name: Build
        run: pnpm tauri build

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: ${{ matrix.os }}-build
          path: src-tauri/target/release/bundle/
```

## 版本号管理规范

### 语义化版本规范

fanyifanyi 遵循 [Semantic Versioning 2.0.0](https://semver.org/) 规范：

**版本号格式：** `MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]`

#### 版本号组成

1. **MAJOR (主版本号)** - 不兼容的 API 变更
   - 重大功能重构
   - 破坏性变更
   - 不向后兼容的修改
   - 示例：`1.0.0` → `2.0.0`

2. **MINOR (次版本号)** - 向后兼容的功能新增
   - 新增功能
   - 功能增强
   - 向后兼容的改进
   - 示例：`1.0.0` → `1.1.0`

3. **PATCH (修订版本号)** - 向后兼容的问题修复
   - Bug 修复
   - 安全补丁
   - 性能优化
   - 示例：`1.0.0` → `1.0.1`

#### 版本号递增规则

- 当发布 MAJOR 版本时，MINOR 和 PATCH 归零：`1.2.3` → `2.0.0`
- 当发布 MINOR 版本时，PATCH 归零：`1.2.3` → `1.3.0`
- 当发布 PATCH 版本时，只递增 PATCH：`1.2.3` → `1.2.4`

#### 版本号示例

```
0.1.0  → 初始开发版本
0.1.1  → Bug 修复
0.2.0  → 新增功能
0.2.1  → Bug 修复
1.0.0  → 首个稳定版本
1.1.0  → 新增功能
1.1.1  → Bug 修复
2.0.0  → 重大变更
```

### 预发布版本

用于测试和早期访问，格式：`MAJOR.MINOR.PATCH-PRERELEASE`

#### 预发布标签

1. **alpha** - 内部测试版本
   - 功能不完整
   - 可能有严重 bug
   - 示例：`1.0.0-alpha.1`, `1.0.0-alpha.2`

2. **beta** - 公开测试版本
   - 功能基本完整
   - 可能有已知问题
   - 示例：`1.0.0-beta.1`, `1.0.0-beta.2`

3. **rc** (Release Candidate) - 发布候选版本
   - 功能完整
   - 准备正式发布
   - 示例：`1.0.0-rc.1`, `1.0.0-rc.2`

#### 预发布版本排序

```
1.0.0-alpha.1
1.0.0-alpha.2
1.0.0-beta.1
1.0.0-beta.2
1.0.0-rc.1
1.0.0-rc.2
1.0.0
```

### 构建元数据

可选的构建信息，格式：`MAJOR.MINOR.PATCH+BUILD`

示例：

- `1.0.0+20251110` - 包含构建日期
- `1.0.0+001` - 包含构建号
- `1.0.0-beta.1+exp.sha.5114f85` - 包含 Git commit

**注意：** 构建元数据不影响版本优先级。

### 版本号同步

确保以下文件中的版本号保持一致：

#### 1. package.json

```json
{
  "name": "fanyifanyi",
  "version": "0.2.0"
}
```

#### 2. src-tauri/tauri.conf.json

```json
{
  "version": "0.2.0"
}
```

#### 3. src-tauri/Cargo.toml

```toml
[package]
name = "fanyifanyi"
version = "0.2.0"
```

#### 使用脚本同步版本号

创建 `scripts/bump-version.sh`：

```bash
#!/bin/bash

NEW_VERSION=$1

if [ -z "$NEW_VERSION" ]; then
  echo "Usage: $0 <new-version>"
  echo "Example: $0 0.2.0"
  exit 1
fi

echo "Updating version to $NEW_VERSION..."

# 更新 package.json
npm version $NEW_VERSION --no-git-tag-version

# 更新 tauri.conf.json
sed -i.bak "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" src-tauri/tauri.conf.json
rm src-tauri/tauri.conf.json.bak

# 更新 Cargo.toml
sed -i.bak "s/^version = \".*\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml
rm src-tauri/Cargo.toml.bak

echo "Version updated to $NEW_VERSION"
echo "Don't forget to update CHANGELOG.md!"
```

使用方法：

```bash
chmod +x scripts/bump-version.sh
./scripts/bump-version.sh 0.2.0
```

### 版本号决策指南

#### 何时递增 MAJOR 版本？

- ✅ 删除或重命名公共 API
- ✅ 改变现有功能的行为
- ✅ 需要用户修改配置或数据
- ✅ 不再支持旧版本的数据格式

#### 何时递增 MINOR 版本？

- ✅ 添加新功能
- ✅ 标记功能为废弃（但仍可用）
- ✅ 内部重构（不影响外部行为）
- ✅ 性能显著提升

#### 何时递增 PATCH 版本？

- ✅ 修复 bug
- ✅ 安全补丁
- ✅ 文档更新
- ✅ 依赖更新（无功能变化）

### Git 标签规范

为每个发布版本创建 Git 标签：

```bash
# 创建带注释的标签
git tag -a v0.2.0 -m "Release version 0.2.0"

# 推送标签到远程
git push origin v0.2.0

# 推送所有标签
git push origin --tags
```

**标签命名规范：**

- 正式版本：`v1.0.0`, `v1.1.0`, `v1.1.1`
- 预发布版本：`v1.0.0-alpha.1`, `v1.0.0-beta.1`, `v1.0.0-rc.1`

### CHANGELOG 管理

在 `CHANGELOG.md` 中记录每个版本的变更：

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- 待发布的新功能

### Changed

- 待发布的变更

### Fixed

- 待发布的修复

## [0.2.0] - 2025-11-10

### Added

- 添加了自动更新功能
- 新增设置页面的更新管理
- 实现更新检查和下载进度显示

### Changed

- 优化了 UI 响应速度
- 改进了错误处理机制

### Fixed

- 修复了翻译结果显示问题
- 修复了设置保存失败的 bug

### Security

- 更新了依赖包以修复安全漏洞

## [0.1.0] - 2025-11-01

### Added

- 初始版本发布
- 基本翻译功能
- 词典查询功能

[Unreleased]: https://github.com/username/fanyifanyi/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/username/fanyifanyi/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/username/fanyifanyi/releases/tag/v0.1.0
```

#### CHANGELOG 分类

- **Added** - 新增功能
- **Changed** - 功能变更
- **Deprecated** - 即将废弃的功能
- **Removed** - 已删除的功能
- **Fixed** - Bug 修复
- **Security** - 安全相关更新

## 故障排除

### 构建失败

1. 检查依赖是否安装完整
2. 清理构建缓存：`rm -rf src-tauri/target`
3. 更新 Rust 工具链：`rustup update`
4. 检查 Tauri 配置是否正确

### 签名失败

1. 确认私钥文件存在：`.tauri/fanyifanyi.key`
2. 检查私钥密码是否正确
3. 重新生成密钥对（如果必要）

### 更新检测失败

1. 检查更新端点 URL 是否正确
2. 验证更新清单 JSON 格式
3. 确认公钥配置正确
4. 检查网络连接和 CORS 设置

### 签名验证失败

1. 确认使用正确的私钥签名
2. 检查公钥是否与私钥匹配
3. 验证签名文件是否完整

## 安全注意事项

### 私钥保护

- ✅ 私钥应保存在安全位置
- ✅ 使用强密码保护私钥
- ✅ 定期备份私钥
- ❌ 不要将私钥提交到版本控制
- ❌ 不要在公共场合分享私钥

### 更新服务器

- ✅ 使用 HTTPS 协议
- ✅ 配置正确的 CORS 头
- ✅ 使用 CDN 加速下载
- ✅ 监控服务器日志

### 签名验证

- ✅ 始终验证下载文件的签名
- ✅ 使用官方的 Tauri 签名工具
- ✅ 在发布前测试签名验证

## 相关脚本

- `setup-signing.sh` - 生成签名密钥对
- `update-pubkey.js` - 更新配置中的公钥
- `build-release.sh` - 构建发布版本
- `generate-manifest.js` - 生成更新清单

## 文档导航

### 本项目文档

- **[README.md](./README.md)** - 脚本使用说明和快速开始
- **[SIGNING_SETUP.md](./SIGNING_SETUP.md)** - 签名密钥设置详细指南
- **[RELEASE_GUIDE.md](./RELEASE_GUIDE.md)** - 本文档，完整的发布流程和版本管理
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - 更新服务器部署指南

### 官方文档

- [Tauri 构建文档](https://v2.tauri.app/distribute/)
- [Tauri Updater 插件文档](https://v2.tauri.app/plugin/updater/)
- [Tauri 签名文档](https://v2.tauri.app/distribute/sign/)
- [语义化版本规范](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)

## 快速参考

### 常用命令速查

```bash
# 更新版本号
./scripts/bump-version.sh 0.2.0

# 构建发布版本
./scripts/build-release.sh

# 生成更新清单
node scripts/generate-manifest.js

# 验证签名
pnpm tauri signer verify <file> --public-key .tauri/fanyifanyi.key.pub

# 创建 Git 标签
git tag -a v0.2.0 -m "Release version 0.2.0"
git push origin v0.2.0

# 使用 GitHub CLI 创建 Release
gh release create v0.2.0 --title "v0.2.0" --notes-file CHANGELOG.md
```

### 发布检查清单

**发布前：**

- [ ] 版本号已更新（package.json, tauri.conf.json, Cargo.toml）
- [ ] CHANGELOG.md 已更新
- [ ] 所有测试通过
- [ ] 代码已提交到 Git
- [ ] 签名密钥可用

**构建阶段：**

- [ ] 构建成功完成
- [ ] 所有平台的更新包已生成
- [ ] 签名文件已生成
- [ ] 签名验证通过

**发布阶段：**

- [ ] 更新清单已生成
- [ ] 清单格式正确
- [ ] 文件已上传到服务器
- [ ] 更新端点配置正确
- [ ] Git 标签已创建

**发布后：**

- [ ] 自动更新功能测试通过
- [ ] 发布公告已发布
- [ ] 文档已更新

### 文件路径速查

```
项目根目录/
├── package.json                          # 前端版本号
├── CHANGELOG.md                          # 更新日志
├── .tauri/
│   ├── fanyifanyi.key                   # 私钥（不提交）
│   └── fanyifanyi.key.pub               # 公钥（提交）
├── src-tauri/
│   ├── tauri.conf.json                  # Tauri 配置和版本号
│   ├── Cargo.toml                       # Rust 包版本号
│   └── target/release/bundle/           # 构建产物
│       ├── macos/                       # macOS 安装包
│       ├── appimage/                    # Linux AppImage
│       ├── deb/                         # Debian 包
│       ├── msi/                         # Windows MSI
│       └── nsis/                        # Windows NSIS
└── scripts/
    ├── setup-signing.sh                 # 生成签名密钥
    ├── bump-version.sh                  # 更新版本号
    ├── build-release.sh                 # 构建发布版本
    ├── generate-manifest.js             # 生成更新清单
    ├── SIGNING_SETUP.md                 # 签名设置指南
    ├── DEPLOYMENT_GUIDE.md              # 部署指南
    └── RELEASE_GUIDE.md                 # 本文档
```

### 环境变量速查

```bash
# 更新清单生成
UPDATE_BASE_URL=https://releases.example.com    # 更新包基础 URL
VERSION=0.2.0                                    # 版本号（可选）
RELEASE_NOTES="更新说明"                         # 自定义更新说明

# Tauri 签名
TAURI_SIGNING_PRIVATE_KEY=<base64-key>          # 私钥（CI/CD 使用）
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=<password>   # 私钥密码
```

### 平台标识符速查

Tauri 使用的平台标识符：

| 平台    | 架构          | 标识符           | 文件扩展名       |
| ------- | ------------- | ---------------- | ---------------- |
| macOS   | Intel         | `darwin-x86_64`  | `.app.tar.gz`    |
| macOS   | Apple Silicon | `darwin-aarch64` | `.app.tar.gz`    |
| Linux   | x86_64        | `linux-x86_64`   | `.AppImage`      |
| Windows | x86_64        | `windows-x86_64` | `.msi` 或 `.exe` |

### 版本号决策树

```
需要发布新版本？
│
├─ 是否有破坏性变更？
│  └─ 是 → 递增 MAJOR 版本 (1.0.0 → 2.0.0)
│
├─ 是否添加新功能？
│  └─ 是 → 递增 MINOR 版本 (1.0.0 → 1.1.0)
│
└─ 是否只是修复 bug？
   └─ 是 → 递增 PATCH 版本 (1.0.0 → 1.0.1)
```

### 常见问题快速解决

| 问题         | 解决方案                                              |
| ------------ | ----------------------------------------------------- |
| 构建失败     | 清理缓存：`rm -rf src-tauri/target`                   |
| 找不到私钥   | 运行：`./scripts/setup-signing.sh`                    |
| 签名验证失败 | 检查公钥配置：`grep pubkey src-tauri/tauri.conf.json` |
| 版本号不一致 | 使用：`./scripts/bump-version.sh <version>`           |
| 更新检测失败 | 验证端点：`curl -I <update-url>`                      |
| CORS 错误    | 检查服务器 CORS 配置                                  |

## 支持

如有问题，请：

1. 查看 Tauri 官方文档：https://v2.tauri.app/
2. 搜索 GitHub Issues
3. 在项目仓库提交 Issue
4. 参考相关文档：
   - [SIGNING_SETUP.md](./SIGNING_SETUP.md) - 签名设置
   - [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - 部署指南
   - [README.md](./README.md) - 脚本使用说明
