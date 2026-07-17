# 快速开始指南

## 🚀 发布新版本（一键操作）

```bash
./scripts/release.sh        # 自动递增 PATCH 版本
./scripts/release.sh 0.2.0  # 或指定版本
```

就这么简单！脚本会自动处理所有事情。

## 📋 首次设置（仅需一次）

### 1. 配置 GitHub Secrets

访问: https://github.com/sunven/fanyifanyi/settings/secrets/actions

添加两个 secrets：

| Name | Value | 如何获取 |
|------|-------|---------|
| `TAURI_SIGNING_PRIVATE_KEY` | 私钥内容 | 运行 `cat .tauri/fanyifanyi-ci.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | `ci-automation` | 固定密码 |

详细步骤见 [SETUP.md](./SETUP.md)

### 2. 安装 git-cliff（可选，用于生成 CHANGELOG）

```bash
# macOS
brew install git-cliff

# Linux
cargo install git-cliff

# Windows
cargo install git-cliff
```

## 📝 提交规范

使用 Conventional Commits：

```bash
# ✅ 好的提交
git commit -m "feat(translate): add batch translation"
git commit -m "fix(dict): resolve crash on empty input"
git commit -m "docs: update installation guide"

# ❌ 避免
git commit -m "update code"
git commit -m "fix bug"
```

## 🔄 完整工作流程

```bash
# 1. 开发功能
git checkout -b feat/new-feature
# ... 编写代码 ...

# 2. 提交（遵循规范）
git add .
git commit -m "feat(scope): description"

# 3. 合并到主分支
git checkout master
git merge feat/new-feature

# 4. 发布
./scripts/release.sh 0.2.0
# 确认推送 (输入 y)

# 5. 等待自动构建（15-20 分钟）
# 访问: https://github.com/sunven/fanyifanyi/actions
```

## 🎯 日常命令

```bash
# 开发
pnpm dev              # 启动开发服务器

# 构建（本地测试）
pnpm build            # 前端构建
pnpm tauri build      # 完整构建

# 代码检查
npx eslint .          # 运行 linter

# 版本管理
./scripts/release.sh         # 自动递增 PATCH 版本并发布
```

## 📦 构建产物位置

发布后，所有平台的安装包会自动上传到：

https://github.com/sunven/fanyifanyi/releases

包含：
- macOS: `.dmg`, `.app.tar.gz` (aarch64 + x86_64)
- Linux: `.AppImage`, `.deb`
- Windows: `.msi`, `.exe`

## 🔍 常见问题

### Q: 构建失败了怎么办？

查看构建日志：https://github.com/sunven/fanyifanyi/actions

常见原因：
- GitHub Secrets 未配置或配置错误
- 依赖安装失败（网络问题）

### Q: 如何撤销错误的 tag？

```bash
# 删除本地 tag
git tag -d v0.2.0

# 删除远程 tag（如果已推送）
git push origin :refs/tags/v0.2.0
```

### Q: 能否不推送直接本地构建？

可以，但只能构建当前平台：

```bash
pnpm tauri build
```

跨平台构建需要 GitHub Actions。

## 📚 更多文档

- [SETUP.md](./SETUP.md) - 详细设置指南
- [CONTRIBUTING.md](./CONTRIBUTING.md) - 贡献指南
- [CLAUDE.md](./CLAUDE.md) - 项目架构说明

## 🆘 获取帮助

- 提交 Issue: https://github.com/sunven/fanyifanyi/issues
- 查看 Actions 日志了解构建问题
- 参考 Tauri 文档: https://tauri.app/

---

**记住**：发布就是运行 `./scripts/release.sh`（或显式指定版本）然后等待！✨
