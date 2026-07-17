# 贡献指南

感谢您对 fanyifanyi (翻译翻译) 项目的关注！

## 提交规范 (Commit Convention)

本项目使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范，这有助于：

- 自动生成 CHANGELOG
- 自动确定语义化版本号
- 更清晰的提交历史

### 提交消息格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type 类型

- **feat**: 新功能 (feature)
- **fix**: 修复 bug
- **docs**: 文档变更
- **style**: 代码格式调整（不影响功能，如空格、格式化等）
- **refactor**: 重构（既不是新功能也不是 bug 修复）
- **perf**: 性能优化
- **test**: 添加或修改测试
- **chore**: 构建过程或辅助工具的变动

### Scope 范围（可选）

指定提交影响的范围，例如：

- `ui`: UI 组件
- `dict`: 字典功能
- `translate`: 翻译功能
- `settings`: 设置页面
- `updater`: 自动更新
- `build`: 构建配置

### 示例

#### 添加新功能

```bash
git commit -m "feat(translate): add support for batch translation"
```

#### 修复 bug

```bash
git commit -m "fix(dict): resolve pronunciation display issue"
```

#### 更新文档

```bash
git commit -m "docs: update README with new installation steps"
```

#### 性能优化

```bash
git commit -m "perf(ui): optimize rendering performance for large text"
```

#### 重大变更（Breaking Change）

对于不兼容的 API 变更，在 footer 中添加 `BREAKING CHANGE:`:

```bash
git commit -m "feat(api): change translation API response format

BREAKING CHANGE: The translation API now returns an object instead of a string.
Update your code to access the translation via the 'text' property."
```

## 开发流程

### 1. Fork 并 Clone 仓库

```bash
git clone https://github.com/YOUR_USERNAME/fanyifanyi.git
cd fanyifanyi
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 创建功能分支

```bash
git checkout -b feat/your-feature-name
```

### 4. 开发并测试

```bash
pnpm dev  # 启动开发服务器
```

### 5. 提交更改

遵循上述提交规范：

```bash
git add .
git commit -m "feat(scope): your feature description"
```

### 6. 推送并创建 Pull Request

```bash
git push origin feat/your-feature-name
```

然后在 GitHub 上创建 Pull Request。

## 代码规范

### TypeScript/React

- 使用 ESLint (@antfu/eslint-config)
- 运行检查: `npx eslint .`
- 使用 TypeScript 严格模式
- 优先使用函数组件和 Hooks

### Rust

- 遵循 Rust 官方代码风格
- 运行格式化: `cargo fmt`
- 运行检查: `cargo clippy`

### 样式

- 使用 Tailwind CSS
- 遵循项目现有的样式模式
- 响应式设计优先

## 测试

虽然目前测试覆盖率较低，但我们鼓励为新功能添加测试：

```bash
pnpm test        # 运行测试
pnpm test:watch  # 监听模式
```

## 发布流程（仅维护者）

维护者可以使用简化的发布脚本：

```bash
./scripts/release.sh        # 自动递增 PATCH 版本
./scripts/release.sh 0.2.0  # 或指定版本
```

这将自动：
1. 更新版本号
2. 生成 CHANGELOG
3. 创建 Git commit 和 tag
4. 推送到远程仓库
5. 触发 GitHub Actions 自动构建和发布

## 问题反馈

- 使用 GitHub Issues 报告 bug
- 提供详细的复现步骤
- 包含系统信息（操作系统、版本等）

## 许可证

提交代码即表示您同意将代码以项目相同的许可证发布。

---

再次感谢您的贡献！ 🎉
