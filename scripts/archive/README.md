# 归档的脚本

这个目录包含了旧的手动构建和发布脚本，已被 GitHub Actions 自动化流程替代。

这些脚本保留作为参考，以防需要手动构建或调试。

## 文件说明

- **build-release.sh** - 手动构建发布版本的脚本（已被 GitHub Actions 替代）
- **generate-manifest.js** - 生成更新清单的脚本（已被 GitHub Actions 替代）
- **setup-signing.sh** - 设置签名密钥的脚本（仅需设置一次，现已完成）

## 新的发布流程

请使用新的简化流程：

```bash
./scripts/release.sh 0.2.0
```

详见主目录的 README.md
