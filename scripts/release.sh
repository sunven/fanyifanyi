#!/bin/bash

# 一键发布脚本
# 用法: ./scripts/release.sh 0.2.0

set -e

VERSION=$1

if [ -z "$VERSION" ]; then
  echo "❌ 错误: 请提供版本号"
  echo "用法: $0 <version>"
  echo "示例: $0 0.2.0"
  exit 1
fi

# 验证版本号格式
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "❌ 错误: 版本号格式不正确"
  echo "必须符合语义化版本规范: MAJOR.MINOR.PATCH (例如: 0.2.0)"
  exit 1
fi

echo "🚀 开始发布流程 v${VERSION}"
echo ""

# 检查工作目录是否干净
if ! git diff-index --quiet HEAD --; then
  echo "❌ 错误: 工作目录有未提交的更改"
  echo "请先提交或暂存所有更改"
  git status --short
  exit 1
fi

# 1. 更新版本号
echo "📝 步骤 1/5: 更新版本号..."
./scripts/bump-version.sh "$VERSION"

# 2. 生成 CHANGELOG
echo "📋 步骤 2/5: 生成 CHANGELOG..."
if command -v git-cliff &> /dev/null; then
  git-cliff --tag "v${VERSION}" -o CHANGELOG.md
  echo "✅ CHANGELOG 已更新"
else
  echo "⚠️  未安装 git-cliff，跳过 CHANGELOG 生成"
  echo "   安装命令: brew install git-cliff (macOS)"
  echo "   或访问: https://github.com/orhun/git-cliff"
fi

# 3. 提交更改
echo "💾 步骤 3/5: 提交更改..."
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock CHANGELOG.md 2>/dev/null || true
git commit -m "chore(release): prepare for v${VERSION}

- Update version to ${VERSION}
- Update CHANGELOG
- Ready for release"

# 4. 创建 Git tag
echo "🏷️  步骤 4/5: 创建 Git tag..."
git tag -a "v${VERSION}" -m "Release v${VERSION}

发布版本 ${VERSION}

详见 CHANGELOG.md"

# 5. 推送到远程仓库
echo "⬆️  步骤 5/5: 推送到远程仓库..."
echo ""
echo "准备推送到远程仓库，这将触发 GitHub Actions 自动构建和发布。"
read -p "是否继续? (y/N) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  git push origin master
  git push origin "v${VERSION}"

  echo ""
  echo "✅ 发布流程完成！"
  echo ""
  echo "📦 接下来："
  echo "  1. GitHub Actions 将自动构建所有平台的安装包 (约 15-20 分钟)"
  echo "  2. 构建完成后会自动创建 GitHub Release"
  echo "  3. 查看构建进度:"
  echo "     https://github.com/sunven/fanyifanyi/actions"
  echo "  4. 发布完成后访问:"
  echo "     https://github.com/sunven/fanyifanyi/releases/tag/v${VERSION}"
  echo ""
else
  echo ""
  echo "⚠️  已取消推送"
  echo "如需推送，请手动执行:"
  echo "  git push origin master"
  echo "  git push origin v${VERSION}"
  echo ""
  echo "或撤销本地提交:"
  echo "  git reset --hard HEAD~1"
  echo "  git tag -d v${VERSION}"
fi
