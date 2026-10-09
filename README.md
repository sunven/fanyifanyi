# fanyifanyi (翻译翻译)

一款基于 Tauri v2 + React + TypeScript 构建的桌面翻译和词典应用。

提供 AI 驱动的翻译功能（使用 OpenAI 兼容 API）和词典查询（通过有道词典 API）。

## 功能特性

- **AI 翻译**: 支持多个 AI 模型的专业中英互译
- **词典查询**: 有道词典集成，提供详细的单词释义、短语、同义词等
- **多模型支持**: 灵活配置和切换不同的 AI 服务提供商
- **失败恢复**: 文本和截图翻译失败后可直接重试，或选择其他引擎重译；本次选择不会修改默认引擎
- **截图阅读浮层**: 译文优先保留选区大小，内容较多时自动扩展并支持滚动；可切换选区原图对照，返回译文保留阅读位置
- **截图快捷键（macOS）**: 应用运行时按 `Control + Option + T` 开始截图，可在设置中改绑或关闭
- **复制后快捷翻译（macOS）**: 复制文字后按 `Control + Option + C` 就地查看译文，按 Esc 返回原应用；支持复制译文、停止及失败重试，快捷键可改绑或关闭
- **划词翻译（macOS）**: 在 Chrome、Safari 普通网页中选中文字后按 `Control + Option + D` 就地翻译；需辅助功能权限，不改写剪贴板，快捷键可改绑或关闭
- **本地历史与收藏**: 自动保存成功的文本译文及截图 OCR 文字与译文，支持搜索、复制、收藏和删除
- **自动更新**: 内置自动更新功能，无需手动下载新版本
- **跨平台**: 支持 macOS、Linux 和 Windows

普通翻译历史保留最近 30 天、最多 500 条，收藏不参与自动清理。可在设置中关闭自动保存或清空普通历史；关闭保存不会删除已有记录，清空普通历史会保留收藏。历史以未加密文件保存在本机，不保存截图图片。

截图原图仅作为临时文件供浮层对照，关闭浮层或应用时释放，历史记录仍只保存文字。

复制后快捷翻译仅在按下快捷键时读取剪贴板纯文本，不持续监听复制操作。使用当前默认引擎进行中英互译；成功结果按文本翻译保存到本地历史，遵守历史保存开关。重复触发相同文字会聚焦现有浮窗，复制新文字后再次触发会替换内容。应用退出后快捷键停止生效。

划词翻译仅在快捷键触发时读取来源应用的选中文字，并沿用默认引擎、中英互译和历史保存设置。首次使用若缺少权限，浮窗提供辅助功能设置入口；授权后返回网页重新选中文字并触发。取词不会覆盖剪贴板，也不模拟复制；未选中文字或读取失败时明确提示，可改用现有复制翻译。图片和扫描 PDF 请使用截图翻译。在快捷翻译浮窗内再次按划词快捷键会保留当前结果。

截图翻译目前仅支持 macOS，使用本地 OCR 后将识别文字交给所选翻译引擎。快捷键在主窗口处于后台或最小化时也可使用，退出应用后停止生效。

## 快速开始

### 开发环境要求

- Node.js 20+
- pnpm 8+
- Rust (通过 [rustup](https://rustup.rs/) 安装)

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev          # 启动 Vite 开发服务器 + Tauri 窗口
pnpm tauri dev    # 或使用此命令启动开发模式
```

### 构建

```bash
pnpm build        # TypeScript 编译 + Vite 构建
pnpm tauri build  # 构建生产环境桌面应用
```

### 代码检查

```bash
npx eslint .      # 运行 ESLint (@antfu 配置)
```

## 发布流程

本项目使用 GitHub Actions 实现完全自动化的构建和发布流程。

### 一键发布（推荐）

```bash
./scripts/release.sh        # 自动递增 PATCH 版本（例如 0.1.36 -> 0.1.37）
./scripts/release.sh 0.2.0  # 或指定版本
```

该脚本会自动：
1. 更新所有文件中的版本号
2. 从 git 提交历史生成 CHANGELOG
3. 创建 git commit 和 tag
4. 推送到远程仓库
5. 触发 GitHub Actions 自动构建所有平台

### GitHub Actions 自动化

推送 tag 后，GitHub Actions 会自动：

- ✅ 并行构建 macOS (aarch64 + x86_64)、Linux (x86_64)、Windows (x86_64)
- ✅ 对所有更新包进行加密签名
- ✅ 创建 GitHub Release 并上传所有安装包
- ✅ 生成更新清单文件，支持应用内自动更新

整个过程约 15-20 分钟，无需任何手动操作。

### 查看发布进度

- 构建进度: https://github.com/sunven/fanyifanyi/actions
- 发布页面: https://github.com/sunven/fanyifanyi/releases

## 贡献指南

我们欢迎所有形式的贡献！

### 提交规范

本项目使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```bash
# 新功能
git commit -m "feat(translate): add batch translation support"

# Bug 修复
git commit -m "fix(dict): resolve pronunciation display issue"

# 文档更新
git commit -m "docs: update installation guide"
```

详见 [CONTRIBUTING.md](./CONTRIBUTING.md)

## 项目结构

```
fanyifanyi/
├── src/                          # 前端代码
│   ├── pages/                    # 页面组件（Home, Settings）
│   ├── components/               # UI 组件
│   │   ├── dictionary-display/  # 词典功能组件
│   │   ├── translate-display/   # 翻译功能组件
│   │   └── ui/                   # shadcn/ui 基础组件
│   └── lib/                      # 核心工具库（AI 集成、配置管理）
├── src-tauri/                    # Rust 后端代码
│   ├── src/lib.rs                # Tauri 命令定义
│   └── capabilities/             # 安全权限配置
├── scripts/                      # 构建和发布脚本
└── .github/workflows/            # GitHub Actions 配置
```

## 技术栈

### 前端

- **框架**: React 19 + TypeScript
- **构建工具**: Vite
- **样式**: Tailwind CSS v4 (OKLCH 色彩空间)
- **UI 组件**: shadcn/ui (New York 风格)
- **AI SDK**: OpenAI (支持兼容 API)

### 后端

- **框架**: Tauri v2
- **语言**: Rust
- **HTTP 客户端**: Tauri Plugin HTTP

### 工具链

- **包管理**: pnpm
- **代码检查**: ESLint (@antfu/eslint-config)
- **提交规范**: Conventional Commits
- **变更日志**: git-cliff
- **CI/CD**: GitHub Actions

## 推荐开发环境

- [VS Code](https://code.visualstudio.com/)
- [Tauri 扩展](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 常见问题

### 构建错误

如遇到构建错误，请参考: https://github.com/tauri-apps/tauri/issues/7338#issuecomment-2933086418

### 路径别名

项目使用 `@/*` 作为 `./src/*` 的别名，始终使用别名导入：

```typescript
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
```

## 许可证

[添加您的许可证信息]

## 致谢

- [Tauri](https://tauri.app/) - 跨平台桌面应用框架
- [shadcn/ui](https://ui.shadcn.com/) - 精美的 React 组件库
- [有道词典 API](https://dict.youdao.com/) - 词典数据提供
