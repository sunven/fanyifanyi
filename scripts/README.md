# 构建和发布脚本

本目录包含用于构建、签名和发布 fanyifanyi 应用的脚本和文档。

## 脚本列表

### 版本管理

- **`bump-version.sh`** - 自动更新所有文件中的版本号

  ```bash
  ./scripts/bump-version.sh 0.2.0
  ```

  此脚本会同步更新：
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/Cargo.lock`

### 签名设置

- **`setup-signing.sh`** - 生成 Tauri 更新签名密钥对

  ```bash
  ./scripts/setup-signing.sh
  ```

- **`update-pubkey.cjs`** - 自动将公钥更新到 tauri.conf.json
  ```bash
  node scripts/update-pubkey.cjs
  ```

### 构建和发布

- **`build-release.sh`** - 构建跨平台发布版本并生成清单

  ```bash
  ./scripts/build-release.sh
  ```

- **`generate-manifest.js`** - 生成 Tauri 更新清单 JSON

  ```bash
  node scripts/generate-manifest.js

  # 或指定自定义 URL
  UPDATE_BASE_URL=https://your-server.com node scripts/generate-manifest.js
  ```

## 文档

- **`SIGNING_SETUP.md`** - 签名密钥设置详细指南
- **`RELEASE_GUIDE.md`** - 完整的发布流程文档

## 快速开始

### 首次设置（仅需一次）

1. 生成签名密钥对：

   ```bash
   ./scripts/setup-signing.sh
   ```

2. 更新配置文件中的公钥：
   ```bash
   node scripts/update-pubkey.cjs
   ```

### 发布新版本

1. 更新版本号：

   ```bash
   ./scripts/bump-version.sh 0.2.0
   ```

2. 更新 `CHANGELOG.md`

3. 提交更改并创建标签：

   ```bash
   git add .
   git commit -m "chore: bump version to 0.2.0"
   git tag -a v0.2.0 -m "Release version 0.2.0"
   ```

4. 构建发布版本：

   ```bash
   ./scripts/build-release.sh
   ```

5. 生成更新清单：

   ```bash
   node scripts/generate-manifest.js
   ```

6. 上传构建产物和更新清单到服务器

7. 测试自动更新功能

## 环境变量

- **`UPDATE_BASE_URL`** - 更新包的基础 URL（用于 generate-manifest.js）
  - 默认值: `https://your-update-server.com/releases`
  - 示例: `https://releases.example.com/fanyifanyi`

## 输出文件

### 构建产物

- **macOS**: `src-tauri/target/release/bundle/macos/`
  - `fanyifanyi.app.tar.gz` - 更新包
  - `fanyifanyi.app.tar.gz.sig` - 签名文件
  - `*.dmg` - 安装镜像

- **Linux**: `src-tauri/target/release/bundle/`
  - `appimage/*.AppImage` - 更新包
  - `appimage/*.AppImage.sig` - 签名文件
  - `deb/*.deb` - Debian 安装包

- **Windows**: `src-tauri/target/release/bundle/`
  - `msi/*.msi` - 更新包
  - `msi/*.msi.sig` - 签名文件
  - `nsis/*.exe` - NSIS 安装程序

### 清单文件

- **`update-manifest.json`** - Tauri 更新清单（上传到服务器）
- **`update-manifest-{version}-report.json`** - 详细构建报告
- **`build-manifest-{version}.txt`** - 构建产物清单

## 注意事项

### 安全

- 🔒 私钥文件 (`.tauri/*.key`) 不应提交到版本控制
- 🔑 妥善保管私钥密码
- ✅ 公钥文件 (`.tauri/*.key.pub`) 应该提交到版本控制

### 跨平台

- 每个平台需要在对应的操作系统上构建
- 可以使用 CI/CD 服务（如 GitHub Actions）自动构建多平台版本

### 版本管理

- 遵循语义化版本规范 (Semantic Versioning)
- 确保 `package.json`、`tauri.conf.json` 和 `Cargo.toml` 中的版本号一致

## 故障排除

### 脚本权限错误

```bash
chmod +x scripts/*.sh
```

### 找不到 Tauri CLI

```bash
pnpm install
```

### 签名失败

检查私钥文件是否存在：

```bash
ls -la .tauri/
```

如果不存在，运行：

```bash
./scripts/setup-signing.sh
```

## 文档导航

### 详细指南

- **[SIGNING_SETUP.md](./SIGNING_SETUP.md)** - 签名密钥设置详细指南
- **[RELEASE_GUIDE.md](./RELEASE_GUIDE.md)** - 完整的发布流程和版本管理规范
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - 更新服务器部署配置指南

### 官方文档

- [Tauri 官方文档](https://v2.tauri.app/)
- [Tauri Updater 插件](https://v2.tauri.app/plugin/updater/)
- [Tauri 构建和分发](https://v2.tauri.app/distribute/)
- [语义化版本规范](https://semver.org/)
