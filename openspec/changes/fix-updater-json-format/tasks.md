## 1. 配置文件修改

- [x] 1.1 修改 `src-tauri/tauri.conf.json` 中的 updater endpoints
  - 从 `https://github.com/sunven/fanyifanyi/releases/download/v{{version}}/{{target}}.json`
  - 改为 `https://github.com/sunven/fanyifanyi/releases/latest/download/latest.json`

- [x] 1.2 验证 `pubkey` 配置正确（确保与签名密钥匹配）

## 2. GitHub Actions Workflow 修改

- [x] 2.1 修改 `.github/workflows/release.yml` 中的 `generate-updater-json` job

- [x] 2.2 重写 JSON 生成逻辑，创建统一的 `latest.json` 格式：
  ```json
  {
    "version": "x.y.z",
    "notes": "Release notes content...",
    "pub_date": "2026-02-04T00:00:00Z",
    "platforms": {
      "darwin-aarch64": {
        "signature": "...",
        "url": "https://github.com/.../fanyifanyi_aarch64.app.tar.gz"
      }
    }
  }
  ```

- [x] 2.3 使用 `git-cliff` 生成的 release notes 填充 `notes` 字段

- [x] 2.4 移除分平台 JSON 文件生成逻辑（删除 `darwin-aarch64.json` 等）

## 3. 手动修复现有 Release

- [x] 3.1 为 v0.1.21 Release 手动生成 `latest.json`

- [x] 3.2 使用 GitHub CLI 上传 `latest.json` 到 v0.1.21 Release：
  ```bash
  gh release upload v0.1.21 latest.json --clobber
  ```

- [x] 3.3 验证 v0.1.21 的 `latest.json` 格式正确（可用 `curl` 测试）

## 4. 测试验证

- [ ] 4.1 本地测试 updater 配置
  - 构建 v0.1.22 版本
  - 验证 `checkForUpdate()` 能正确请求 `latest.json`

- [ ] 4.2 测试完整更新流程
  - 从 v0.1.21（手动补发 `latest.json` 后）检查更新
  - 下载并安装 v0.1.22
  - 验证签名验证通过
  - 验证应用重启后版本正确

- [ ] 4.3 验证错误处理
  - 测试网络错误时的用户提示
  - 测试签名验证失败时的处理

## 5. 发布 v0.1.22

- [ ] 5.1 创建并推送 tag `v0.1.22`

- [ ] 5.2 等待 GitHub Actions 完成构建

- [ ] 5.3 验证生成的 `latest.json` 格式正确

- [ ] 5.4 下载并安装 v0.1.22，进行端到端测试

- [ ] 5.5 在 Release Notes 中添加升级说明（针对 v0.1.21 及之前用户）
