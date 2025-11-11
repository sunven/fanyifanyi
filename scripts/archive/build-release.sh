#!/bin/bash

# Tauri 应用发布构建脚本
# 此脚本用于构建跨平台的发布版本，并自动签名更新包

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
PRIVATE_KEY_PATH=".tauri/fanyifanyi.key"
BUILD_DIR="src-tauri/target/release"
BUNDLE_DIR="$BUILD_DIR/bundle"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Tauri 发布版本构建脚本${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查私钥是否存在
if [ ! -f "$PRIVATE_KEY_PATH" ]; then
    echo -e "${RED}❌ 错误: 找不到私钥文件${NC}"
    echo -e "${YELLOW}   路径: $PRIVATE_KEY_PATH${NC}"
    echo ""
    echo "请先运行以下命令生成密钥对："
    echo "  ./scripts/setup-signing.sh"
    exit 1
fi

echo -e "${GREEN}✅ 找到私钥文件${NC}"
echo ""

# 获取版本号
VERSION=$(node -p "require('./package.json').version")
echo -e "${BLUE}📦 构建版本: ${GREEN}$VERSION${NC}"
echo ""

# 清理旧的构建产物（可选）
read -p "是否清理旧的构建产物? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}🧹 清理旧构建...${NC}"
    rm -rf "$BUILD_DIR"
    echo -e "${GREEN}✅ 清理完成${NC}"
    echo ""
fi

# 构建前端
echo -e "${BLUE}🔨 构建前端资源...${NC}"
pnpm build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 前端构建失败${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 前端构建完成${NC}"
echo ""

# 构建 Tauri 应用
echo -e "${BLUE}🔨 构建 Tauri 应用...${NC}"
echo -e "${YELLOW}   这可能需要几分钟时间...${NC}"
echo ""

pnpm tauri build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Tauri 构建失败${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Tauri 构建完成${NC}"
echo ""

# 查找并列出构建产物
echo -e "${BLUE}📋 构建产物清单:${NC}"
echo -e "${BLUE}========================================${NC}"

# 创建清单文件
MANIFEST_FILE="build-manifest-$VERSION.txt"
echo "fanyifanyi v$VERSION - 构建产物清单" > "$MANIFEST_FILE"
echo "构建时间: $(date)" >> "$MANIFEST_FILE"
echo "========================================" >> "$MANIFEST_FILE"
echo "" >> "$MANIFEST_FILE"

# 检测操作系统并列出相应的构建产物
OS_TYPE=$(uname -s)

case "$OS_TYPE" in
    Darwin*)
        echo -e "${GREEN}🍎 macOS 构建产物:${NC}"
        echo "" >> "$MANIFEST_FILE"
        echo "macOS 构建产物:" >> "$MANIFEST_FILE"
        echo "----------------------------------------" >> "$MANIFEST_FILE"
        
        # .app bundle
        if [ -d "$BUNDLE_DIR/macos/fanyifanyi.app" ]; then
            APP_SIZE=$(du -sh "$BUNDLE_DIR/macos/fanyifanyi.app" | cut -f1)
            echo -e "  📦 fanyifanyi.app (${APP_SIZE})"
            echo "  - fanyifanyi.app ($APP_SIZE)" >> "$MANIFEST_FILE"
        fi
        
        # .dmg
        if [ -f "$BUNDLE_DIR/dmg/fanyifanyi_${VERSION}_universal.dmg" ]; then
            DMG_SIZE=$(du -sh "$BUNDLE_DIR/dmg/fanyifanyi_${VERSION}_universal.dmg" | cut -f1)
            DMG_PATH="$BUNDLE_DIR/dmg/fanyifanyi_${VERSION}_universal.dmg"
            echo -e "  📦 fanyifanyi_${VERSION}_universal.dmg (${DMG_SIZE})"
            echo "  - fanyifanyi_${VERSION}_universal.dmg ($DMG_SIZE)" >> "$MANIFEST_FILE"
            echo "    路径: $DMG_PATH" >> "$MANIFEST_FILE"
        fi
        
        # .app.tar.gz (用于更新)
        if [ -f "$BUNDLE_DIR/macos/fanyifanyi.app.tar.gz" ]; then
            TAR_SIZE=$(du -sh "$BUNDLE_DIR/macos/fanyifanyi.app.tar.gz" | cut -f1)
            TAR_PATH="$BUNDLE_DIR/macos/fanyifanyi.app.tar.gz"
            echo -e "  📦 fanyifanyi.app.tar.gz (${TAR_SIZE}) ${YELLOW}[更新包]${NC}"
            echo "  - fanyifanyi.app.tar.gz ($TAR_SIZE) [更新包]" >> "$MANIFEST_FILE"
            echo "    路径: $TAR_PATH" >> "$MANIFEST_FILE"
            
            # 检查签名文件
            if [ -f "$TAR_PATH.sig" ]; then
                echo -e "  ✅ 签名文件: fanyifanyi.app.tar.gz.sig"
                echo "    ✅ 签名文件: fanyifanyi.app.tar.gz.sig" >> "$MANIFEST_FILE"
            else
                echo -e "  ${YELLOW}⚠️  未找到签名文件${NC}"
                echo "    ⚠️  未找到签名文件" >> "$MANIFEST_FILE"
            fi
        fi
        ;;
        
    Linux*)
        echo -e "${GREEN}🐧 Linux 构建产物:${NC}"
        echo "" >> "$MANIFEST_FILE"
        echo "Linux 构建产物:" >> "$MANIFEST_FILE"
        echo "----------------------------------------" >> "$MANIFEST_FILE"
        
        # .deb
        if ls "$BUNDLE_DIR/deb/fanyifanyi_${VERSION}"*.deb 1> /dev/null 2>&1; then
            for deb in "$BUNDLE_DIR/deb/fanyifanyi_${VERSION}"*.deb; do
                DEB_SIZE=$(du -sh "$deb" | cut -f1)
                DEB_NAME=$(basename "$deb")
                echo -e "  📦 $DEB_NAME (${DEB_SIZE})"
                echo "  - $DEB_NAME ($DEB_SIZE)" >> "$MANIFEST_FILE"
                echo "    路径: $deb" >> "$MANIFEST_FILE"
            done
        fi
        
        # .AppImage
        if ls "$BUNDLE_DIR/appimage/fanyifanyi_${VERSION}"*.AppImage 1> /dev/null 2>&1; then
            for appimage in "$BUNDLE_DIR/appimage/fanyifanyi_${VERSION}"*.AppImage; do
                APPIMAGE_SIZE=$(du -sh "$appimage" | cut -f1)
                APPIMAGE_NAME=$(basename "$appimage")
                echo -e "  📦 $APPIMAGE_NAME (${APPIMAGE_SIZE}) ${YELLOW}[更新包]${NC}"
                echo "  - $APPIMAGE_NAME ($APPIMAGE_SIZE) [更新包]" >> "$MANIFEST_FILE"
                echo "    路径: $appimage" >> "$MANIFEST_FILE"
                
                # 检查签名文件
                if [ -f "$appimage.sig" ]; then
                    echo -e "  ✅ 签名文件: $APPIMAGE_NAME.sig"
                    echo "    ✅ 签名文件: $APPIMAGE_NAME.sig" >> "$MANIFEST_FILE"
                else
                    echo -e "  ${YELLOW}⚠️  未找到签名文件${NC}"
                    echo "    ⚠️  未找到签名文件" >> "$MANIFEST_FILE"
                fi
            done
        fi
        ;;
        
    MINGW*|MSYS*|CYGWIN*)
        echo -e "${GREEN}🪟 Windows 构建产物:${NC}"
        echo "" >> "$MANIFEST_FILE"
        echo "Windows 构建产物:" >> "$MANIFEST_FILE"
        echo "----------------------------------------" >> "$MANIFEST_FILE"
        
        # .msi
        if ls "$BUNDLE_DIR/msi/fanyifanyi_${VERSION}"*.msi 1> /dev/null 2>&1; then
            for msi in "$BUNDLE_DIR/msi/fanyifanyi_${VERSION}"*.msi; do
                MSI_SIZE=$(du -sh "$msi" | cut -f1)
                MSI_NAME=$(basename "$msi")
                echo -e "  📦 $MSI_NAME (${MSI_SIZE}) ${YELLOW}[更新包]${NC}"
                echo "  - $MSI_NAME ($MSI_SIZE) [更新包]" >> "$MANIFEST_FILE"
                echo "    路径: $msi" >> "$MANIFEST_FILE"
                
                # 检查签名文件
                if [ -f "$msi.sig" ]; then
                    echo -e "  ✅ 签名文件: $MSI_NAME.sig"
                    echo "    ✅ 签名文件: $MSI_NAME.sig" >> "$MANIFEST_FILE"
                else
                    echo -e "  ${YELLOW}⚠️  未找到签名文件${NC}"
                    echo "    ⚠️  未找到签名文件" >> "$MANIFEST_FILE"
                fi
            done
        fi
        
        # .exe (NSIS installer)
        if ls "$BUNDLE_DIR/nsis/fanyifanyi_${VERSION}"*.exe 1> /dev/null 2>&1; then
            for exe in "$BUNDLE_DIR/nsis/fanyifanyi_${VERSION}"*.exe; do
                EXE_SIZE=$(du -sh "$exe" | cut -f1)
                EXE_NAME=$(basename "$exe")
                echo -e "  📦 $EXE_NAME (${EXE_SIZE})"
                echo "  - $EXE_NAME ($EXE_SIZE)" >> "$MANIFEST_FILE"
                echo "    路径: $exe" >> "$MANIFEST_FILE"
            done
        fi
        ;;
        
    *)
        echo -e "${YELLOW}⚠️  未知操作系统: $OS_TYPE${NC}"
        echo "未知操作系统: $OS_TYPE" >> "$MANIFEST_FILE"
        ;;
esac

echo ""
echo -e "${BLUE}========================================${NC}"
echo ""

# 保存清单文件
echo -e "${GREEN}✅ 构建清单已保存到: ${BLUE}$MANIFEST_FILE${NC}"
echo ""

# 下一步提示
echo -e "${BLUE}📝 下一步操作:${NC}"
echo -e "${BLUE}========================================${NC}"
echo "1. 检查构建产物是否完整"
echo "2. 测试安装包是否正常工作"
echo "3. 生成更新清单:"
echo -e "   ${YELLOW}node scripts/generate-manifest.js${NC}"
echo "4. 上传构建产物到发布服务器"
echo "5. 更新服务器上的更新清单"
echo ""
echo -e "${GREEN}✅ 构建完成！${NC}"
