# 更新服务器部署指南

本文档说明如何部署和配置 fanyifanyi 应用的自动更新服务器。

## 概述

Tauri 自动更新功能需要一个 HTTP(S) 服务器来托管：

1. **更新清单** (update-manifest.json) - 包含最新版本信息和下载链接
2. **安装包文件** - 各平台的更新包和签名文件

## 更新清单托管方式

### 清单文件格式

更新清单是一个 JSON 文件，包含版本信息和各平台的下载链接：

```json
{
  "version": "0.2.0",
  "notes": "修复了若干 bug，添加了新功能",
  "pub_date": "2025-11-10T12:00:00Z",
  "platforms": {
    "darwin-x86_64": {
      "signature": "BASE64_SIGNATURE_STRING",
      "url": "https://releases.example.com/fanyifanyi-0.2.0-x64.app.tar.gz"
    },
    "darwin-aarch64": {
      "signature": "BASE64_SIGNATURE_STRING",
      "url": "https://releases.example.com/fanyifanyi-0.2.0-aarch64.app.tar.gz"
    },
    "linux-x86_64": {
      "signature": "BASE64_SIGNATURE_STRING",
      "url": "https://releases.example.com/fanyifanyi-0.2.0-amd64.AppImage"
    },
    "windows-x86_64": {
      "signature": "BASE64_SIGNATURE_STRING",
      "url": "https://releases.example.com/fanyifanyi-0.2.0-x64-setup.msi"
    }
  }
}
```

### 端点 URL 配置

在 `src-tauri/tauri.conf.json` 中配置更新端点：

```json
{
  "bundle": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://your-server.com/updates/{{target}}/{{current_version}}"
      ],
      "pubkey": "YOUR_PUBLIC_KEY"
    }
  }
}
```

**URL 模板变量：**

- `{{target}}` - 平台标识符（如 `darwin-x86_64`、`windows-x86_64`）
- `{{current_version}}` - 当前应用版本号
- `{{arch}}` - 系统架构（如 `x86_64`、`aarch64`）

**简化配置（推荐）：**

如果所有平台使用同一个清单文件，可以简化为：

```json
{
  "bundle": {
    "updater": {
      "endpoints": [
        "https://your-server.com/updates/update-manifest.json"
      ]
    }
  }
}
```

## 部署选项

### 选项 1: GitHub Releases（推荐）

使用 GitHub Releases 托管更新文件，完全免费且可靠。

#### 优点

- ✅ 免费托管
- ✅ 自动生成下载链接
- ✅ 内置 CDN 加速
- ✅ 版本管理简单
- ✅ 支持自动化部署

#### 配置步骤

**1. 创建 GitHub Release**

```bash
# 使用 GitHub CLI
gh release create v0.2.0 \
  --title "v0.2.0" \
  --notes "$(cat CHANGELOG.md)"
```

**2. 上传构建产物**

```bash
# 上传所有平台的安装包和签名文件
gh release upload v0.2.0 \
  src-tauri/target/release/bundle/macos/*.app.tar.gz \
  src-tauri/target/release/bundle/macos/*.app.tar.gz.sig \
  src-tauri/target/release/bundle/appimage/*.AppImage \
  src-tauri/target/release/bundle/appimage/*.AppImage.sig \
  src-tauri/target/release/bundle/msi/*.msi \
  src-tauri/target/release/bundle/msi/*.msi.sig
```

**3. 上传更新清单**

```bash
# 生成清单（使用 GitHub Releases URL）
UPDATE_BASE_URL=https://github.com/your-username/fanyifanyi/releases/download/v0.2.0 \
  node scripts/generate-manifest.js

# 上传清单
gh release upload v0.2.0 update-manifest.json
```

**4. 配置更新端点**

在 `tauri.conf.json` 中：

```json
{
  "bundle": {
    "updater": {
      "endpoints": [
        "https://github.com/your-username/fanyifanyi/releases/latest/download/update-manifest.json"
      ]
    }
  }
}
```

#### 使用 GitHub Actions 自动化

创建 `.github/workflows/release.yml`：

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build-and-release:
    strategy:
      matrix:
        platform: [macos-latest, ubuntu-latest, windows-latest]

    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install dependencies
        run: pnpm install

      - name: Build
        run: pnpm tauri build
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}

      - name: Upload Release Assets
        uses: softprops/action-gh-release@v1
        with:
          files: |
            src-tauri/target/release/bundle/**/*.app.tar.gz
            src-tauri/target/release/bundle/**/*.app.tar.gz.sig
            src-tauri/target/release/bundle/**/*.AppImage
            src-tauri/target/release/bundle/**/*.AppImage.sig
            src-tauri/target/release/bundle/**/*.msi
            src-tauri/target/release/bundle/**/*.msi.sig
            src-tauri/target/release/bundle/**/*.exe
            src-tauri/target/release/bundle/**/*.exe.sig
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  generate-manifest:
    needs: build-and-release
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Generate Update Manifest
        run: |
          VERSION=${GITHUB_REF#refs/tags/v}
          UPDATE_BASE_URL=https://github.com/${{ github.repository }}/releases/download/${GITHUB_REF#refs/tags/} \
            node scripts/generate-manifest.js

      - name: Upload Manifest
        uses: softprops/action-gh-release@v1
        with:
          files: update-manifest.json
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**配置 Secrets：**

在 GitHub 仓库设置中添加：

- `TAURI_SIGNING_PRIVATE_KEY` - 私钥内容（base64 编码）
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` - 私钥密码

```bash
# 获取 base64 编码的私钥
cat .tauri/fanyifanyi.key | base64
```

### 选项 2: 自建服务器

使用自己的服务器托管更新文件。

#### 优点

- ✅ 完全控制
- ✅ 自定义域名
- ✅ 可以添加访问统计
- ✅ 可以实现高级功能（如 A/B 测试）

#### 缺点

- ❌ 需要维护成本
- ❌ 需要配置 HTTPS
- ❌ 需要考虑带宽和存储

#### Nginx 配置示例

**1. 目录结构**

```
/var/www/fanyifanyi/
├── updates/
│   └── update-manifest.json
└── releases/
    ├── v0.2.0/
    │   ├── fanyifanyi-0.2.0-x64.app.tar.gz
    │   ├── fanyifanyi-0.2.0-x64.app.tar.gz.sig
    │   ├── fanyifanyi-0.2.0-amd64.AppImage
    │   ├── fanyifanyi-0.2.0-amd64.AppImage.sig
    │   ├── fanyifanyi-0.2.0-x64-setup.msi
    │   └── fanyifanyi-0.2.0-x64-setup.msi.sig
    └── v0.3.0/
        └── ...
```

**2. Nginx 配置**

创建 `/etc/nginx/sites-available/fanyifanyi-updates`：

```nginx
server {
    listen 443 ssl http2;
    server_name updates.example.com;

    # SSL 证书配置
    ssl_certificate /etc/letsencrypt/live/updates.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/updates.example.com/privkey.pem;

    # 根目录
    root /var/www/fanyifanyi;

    # 启用 gzip 压缩
    gzip on;
    gzip_types application/json;

    # CORS 配置（如果需要）
    add_header Access-Control-Allow-Origin "*";
    add_header Access-Control-Allow-Methods "GET, OPTIONS";
    add_header Access-Control-Allow-Headers "Content-Type";

    # 更新清单端点
    location /updates/ {
        try_files $uri $uri/ =404;
        add_header Content-Type application/json;
        add_header Cache-Control "no-cache, must-revalidate";
    }

    # 发布文件端点
    location /releases/ {
        try_files $uri $uri/ =404;
        add_header Cache-Control "public, max-age=31536000";
    }

    # 访问日志
    access_log /var/log/nginx/fanyifanyi-updates-access.log;
    error_log /var/log/nginx/fanyifanyi-updates-error.log;
}

# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name updates.example.com;
    return 301 https://$server_name$request_uri;
}
```

**3. 启用配置**

```bash
# 创建符号链接
sudo ln -s /etc/nginx/sites-available/fanyifanyi-updates /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

**4. 部署脚本**

创建 `scripts/deploy-to-server.sh`：

```bash
#!/bin/bash

VERSION=$1
SERVER="user@updates.example.com"
REMOTE_PATH="/var/www/fanyifanyi"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  exit 1
fi

echo "Deploying version $VERSION to server..."

# 创建远程目录
ssh $SERVER "mkdir -p $REMOTE_PATH/releases/v$VERSION"

# 上传构建产物
rsync -avz --progress \
  src-tauri/target/release/bundle/ \
  $SERVER:$REMOTE_PATH/releases/v$VERSION/

# 生成并上传更新清单
UPDATE_BASE_URL=https://updates.example.com/releases/v$VERSION \
  node scripts/generate-manifest.js

rsync -avz update-manifest.json \
  $SERVER:$REMOTE_PATH/updates/

echo "Deployment complete!"
```

**5. 配置更新端点**

在 `tauri.conf.json` 中：

```json
{
  "bundle": {
    "updater": {
      "endpoints": [
        "https://updates.example.com/updates/update-manifest.json"
      ]
    }
  }
}
```

#### Apache 配置示例

创建 `/etc/apache2/sites-available/fanyifanyi-updates.conf`：

```apache
<VirtualHost *:443>
    ServerName updates.example.com
    DocumentRoot /var/www/fanyifanyi

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/updates.example.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/updates.example.com/privkey.pem

    # CORS 配置
    Header set Access-Control-Allow-Origin "*"
    Header set Access-Control-Allow-Methods "GET, OPTIONS"

    <Directory /var/www/fanyifanyi/updates>
        Options -Indexes +FollowSymLinks
        AllowOverride None
        Require all granted

        # 禁用缓存
        Header set Cache-Control "no-cache, must-revalidate"
    </Directory>

    <Directory /var/www/fanyifanyi/releases>
        Options -Indexes +FollowSymLinks
        AllowOverride None
        Require all granted

        # 启用长期缓存
        Header set Cache-Control "public, max-age=31536000"
    </Directory>

    ErrorLog ${APACHE_LOG_DIR}/fanyifanyi-updates-error.log
    CustomLog ${APACHE_LOG_DIR}/fanyifanyi-updates-access.log combined
</VirtualHost>

<VirtualHost *:80>
    ServerName updates.example.com
    Redirect permanent / https://updates.example.com/
</VirtualHost>
```

启用配置：

```bash
# 启用必要的模块
sudo a2enmod ssl headers rewrite

# 启用站点
sudo a2ensite fanyifanyi-updates

# 重启 Apache
sudo systemctl restart apache2
```

### 选项 3: 云存储 (AWS S3 / 阿里云 OSS)

使用云存储服务托管更新文件。

#### 优点

- ✅ 高可用性和可靠性
- ✅ 全球 CDN 加速
- ✅ 按使用量付费
- ✅ 易于扩展

#### AWS S3 配置示例

**1. 创建 S3 存储桶**

```bash
# 使用 AWS CLI
aws s3 mb s3://fanyifanyi-updates --region us-east-1
```

**2. 配置存储桶策略**

创建 `bucket-policy.json`：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::fanyifanyi-updates/*"
    }
  ]
}
```

应用策略：

```bash
aws s3api put-bucket-policy \
  --bucket fanyifanyi-updates \
  --policy file://bucket-policy.json
```

**3. 配置 CORS**

创建 `cors-config.json`：

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

应用 CORS 配置：

```bash
aws s3api put-bucket-cors \
  --bucket fanyifanyi-updates \
  --cors-configuration file://cors-config.json
```

**4. 上传文件**

```bash
# 上传构建产物
aws s3 sync src-tauri/target/release/bundle/ \
  s3://fanyifanyi-updates/releases/v0.2.0/ \
  --acl public-read

# 上传更新清单
aws s3 cp update-manifest.json \
  s3://fanyifanyi-updates/updates/ \
  --acl public-read \
  --cache-control "no-cache, must-revalidate"
```

**5. 配置 CloudFront CDN（可选）**

创建 CloudFront 分发以加速全球访问：

```bash
aws cloudfront create-distribution \
  --origin-domain-name fanyifanyi-updates.s3.amazonaws.com \
  --default-root-object index.html
```

**6. 配置更新端点**

```json
{
  "bundle": {
    "updater": {
      "endpoints": [
        "https://fanyifanyi-updates.s3.amazonaws.com/updates/update-manifest.json"
      ]
    }
  }
}
```

或使用 CloudFront 域名：

```json
{
  "bundle": {
    "updater": {
      "endpoints": [
        "https://d1234567890.cloudfront.net/updates/update-manifest.json"
      ]
    }
  }
}
```

#### 阿里云 OSS 配置示例

**1. 创建 OSS 存储桶**

```bash
# 使用阿里云 CLI
aliyun oss mb oss://fanyifanyi-updates --region cn-hangzhou
```

**2. 配置公共读权限**

```bash
aliyun oss bucket-acl --bucket fanyifanyi-updates --acl public-read
```

**3. 配置 CORS**

在 OSS 控制台或使用 API 配置 CORS 规则：

- 来源：`*`
- 允许方法：`GET`, `HEAD`
- 允许头部：`*`

**4. 上传文件**

```bash
# 使用 ossutil 工具
ossutil cp -r src-tauri/target/release/bundle/ \
  oss://fanyifanyi-updates/releases/v0.2.0/

ossutil cp update-manifest.json \
  oss://fanyifanyi-updates/updates/ \
  --meta Cache-Control:no-cache
```

**5. 配置 CDN 加速（可选）**

在阿里云控制台配置 CDN 加速域名。

**6. 配置更新端点**

```json
{
  "bundle": {
    "updater": {
      "endpoints": [
        "https://fanyifanyi-updates.oss-cn-hangzhou.aliyuncs.com/updates/update-manifest.json"
      ]
    }
  }
}
```

## 安全配置

### HTTPS 要求

Tauri 更新功能**必须**使用 HTTPS 协议，以确保传输安全。

**获取免费 SSL 证书：**

使用 Let's Encrypt：

```bash
# 安装 Certbot
sudo apt-get install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d updates.example.com
```

### CORS 配置

如果更新服务器和应用不在同一域名，需要配置 CORS。

**Nginx CORS 头：**

```nginx
add_header Access-Control-Allow-Origin "*";
add_header Access-Control-Allow-Methods "GET, OPTIONS";
add_header Access-Control-Allow-Headers "Content-Type";
```

**Apache CORS 头：**

```apache
Header set Access-Control-Allow-Origin "*"
Header set Access-Control-Allow-Methods "GET, OPTIONS"
```

### 签名验证

确保所有更新包都经过签名，并在清单中包含签名信息。

```json
{
  "platforms": {
    "darwin-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUldUTE...",
      "url": "https://..."
    }
  }
}
```

## 监控和维护

### 访问日志分析

监控更新请求，了解用户更新情况：

```bash
# 分析 Nginx 日志
tail -f /var/log/nginx/fanyifanyi-updates-access.log

# 统计更新请求
grep "update-manifest.json" /var/log/nginx/fanyifanyi-updates-access.log | wc -l
```

### 带宽监控

监控下载带宽使用情况，避免超出预算。

### 错误监控

设置错误告警，及时发现问题：

```bash
# 监控 404 错误
grep " 404 " /var/log/nginx/fanyifanyi-updates-error.log
```

### 定期备份

定期备份更新文件和清单：

```bash
# 备份脚本
#!/bin/bash
BACKUP_DIR="/backup/fanyifanyi-updates"
DATE=$(date +%Y%m%d)

tar -czf $BACKUP_DIR/updates-$DATE.tar.gz /var/www/fanyifanyi/
```

## 故障排除

### 更新检测失败

**问题：** 应用无法检测到更新

**解决方案：**

1. 检查更新端点 URL 是否正确
2. 验证服务器是否可访问（使用 curl 测试）
3. 检查 CORS 配置
4. 查看应用日志和网络请求

```bash
# 测试更新端点
curl -I https://updates.example.com/updates/update-manifest.json
```

### 签名验证失败

**问题：** 下载的更新包签名验证失败

**解决方案：**

1. 确认使用正确的私钥签名
2. 检查公钥配置是否正确
3. 验证签名文件是否完整
4. 重新生成签名

### 下载速度慢

**问题：** 更新包下载速度慢

**解决方案：**

1. 使用 CDN 加速
2. 选择离用户更近的服务器
3. 压缩更新包大小
4. 使用云存储服务

### 404 错误

**问题：** 更新文件返回 404

**解决方案：**

1. 检查文件路径是否正确
2. 验证文件权限
3. 检查 Nginx/Apache 配置
4. 确认文件已上传

## 最佳实践

### 1. 使用版本化 URL

为每个版本创建独立目录：

```
/releases/v0.2.0/
/releases/v0.3.0/
```

### 2. 保留旧版本

保留至少最近 3 个版本的更新包，以支持用户从旧版本更新。

### 3. 使用 CDN

使用 CDN 加速全球用户的下载速度。

### 4. 监控和告警

设置监控和告警，及时发现问题。

### 5. 定期测试

定期测试更新流程，确保一切正常。

### 6. 文档化

记录部署配置和流程，方便团队协作。

## 文档导航

### 本项目文档

- **[README.md](./README.md)** - 脚本使用说明和快速开始
- **[SIGNING_SETUP.md](./SIGNING_SETUP.md)** - 签名密钥设置详细指南
- **[RELEASE_GUIDE.md](./RELEASE_GUIDE.md)** - 完整的发布流程和版本管理
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - 本文档，更新服务器部署指南

### 官方文档

- [Tauri Updater 插件文档](https://v2.tauri.app/plugin/updater/)
- [Tauri 分发文档](https://v2.tauri.app/distribute/)
- [Tauri 签名文档](https://v2.tauri.app/distribute/sign/)
- [语义化版本规范](https://semver.org/)

## 支持

如有问题，请参考：

- Tauri 官方文档
- GitHub Issues
- 社区论坛
