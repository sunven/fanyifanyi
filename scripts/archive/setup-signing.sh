#!/bin/bash

# 自动更新签名密钥设置脚本
# 此脚本用于生成 Tauri 更新签名所需的密钥对

set -e

echo "=========================================="
echo "Tauri 更新签名密钥生成工具"
echo "=========================================="
echo ""

# 创建 .tauri 目录（如果不存在）
mkdir -p .tauri

# 检查是否已存在密钥
if [ -f ".tauri/fanyifanyi.key" ]; then
    echo "⚠️  警告: 密钥文件已存在于 .tauri/fanyifanyi.key"
    echo ""
    read -p "是否要覆盖现有密钥? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "操作已取消"
        exit 0
    fi
fi

echo "正在生成密钥对..."
echo "请输入密码来保护私钥（建议使用强密码）"
echo ""

# 生成密钥对
pnpm tauri signer generate -w .tauri/fanyifanyi.key

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 密钥对生成成功！"
    echo ""
    echo "私钥位置: .tauri/fanyifanyi.key"
    echo "公钥位置: .tauri/fanyifanyi.key.pub"
    echo ""
    echo "----------------------------------------"
    echo "下一步操作："
    echo "----------------------------------------"
    echo "1. 将公钥添加到 src-tauri/tauri.conf.json"
    echo "   运行: node scripts/update-pubkey.js"
    echo ""
    echo "2. 确保私钥已添加到 .gitignore（已自动完成）"
    echo ""
    echo "3. 安全保存私钥备份到密码管理器或安全位置"
    echo ""
    echo "⚠️  重要提醒："
    echo "   - 私钥文件 (.tauri/fanyifanyi.key) 不应提交到版本控制"
    echo "   - 请妥善保管私钥，丢失后将无法签名新版本"
    echo "   - 公钥需要添加到 tauri.conf.json 中"
    echo ""
else
    echo "❌ 密钥生成失败"
    exit 1
fi
