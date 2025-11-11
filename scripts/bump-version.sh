#!/bin/bash

# 版本号更新脚本
# 用法: ./scripts/bump-version.sh <new-version>
# 示例: ./scripts/bump-version.sh 0.2.0

set -e

NEW_VERSION=$1

if [ -z "$NEW_VERSION" ]; then
  echo "错误: 请提供新版本号"
  echo "用法: $0 <new-version>"
  echo "示例: $0 0.2.0"
  exit 1
fi

# 验证版本号格式（语义化版本）
if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$'; then
  echo "错误: 版本号格式不正确"
  echo "请使用语义化版本格式: MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]"
  echo "示例: 1.0.0, 1.0.0-beta.1, 1.0.0+20251110"
  exit 1
fi

echo "正在更新版本号到 $NEW_VERSION..."
echo ""

# 1. 更新 package.json
echo "📦 更新 package.json..."
if command -v jq &> /dev/null; then
  # 使用 jq 更新（保持格式）
  jq ".version = \"$NEW_VERSION\"" package.json > package.json.tmp
  mv package.json.tmp package.json
else
  # 使用 npm version（不创建 git tag）
  npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version
fi
echo "✅ package.json 已更新"

# 2. 更新 src-tauri/tauri.conf.json
echo "⚙️  更新 src-tauri/tauri.conf.json..."
if command -v jq &> /dev/null; then
  jq ".version = \"$NEW_VERSION\"" src-tauri/tauri.conf.json > src-tauri/tauri.conf.json.tmp
  mv src-tauri/tauri.conf.json.tmp src-tauri/tauri.conf.json
else
  # 使用 sed 作为备选方案
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" src-tauri/tauri.conf.json
  else
    # Linux
    sed -i "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" src-tauri/tauri.conf.json
  fi
fi
echo "✅ src-tauri/tauri.conf.json 已更新"

# 3. 更新 src-tauri/Cargo.toml
echo "🦀 更新 src-tauri/Cargo.toml..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  sed -i '' "s/^version = \".*\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml
else
  # Linux
  sed -i "s/^version = \".*\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml
fi
echo "✅ src-tauri/Cargo.toml 已更新"

# 4. 更新 Cargo.lock
echo "🔒 更新 src-tauri/Cargo.lock..."
cd src-tauri
cargo update --workspace
cd ..
echo "✅ src-tauri/Cargo.lock 已更新"

echo ""
echo "🎉 版本号已成功更新到 $NEW_VERSION"
echo ""
echo "下一步:"
echo "  1. 更新 CHANGELOG.md 添加版本更新说明"
echo "  2. 提交更改: git add . && git commit -m \"chore: bump version to $NEW_VERSION\""
echo "  3. 创建标签: git tag -a v$NEW_VERSION -m \"Release version $NEW_VERSION\""
echo "  4. 构建发布: ./scripts/build-release.sh"
echo ""
