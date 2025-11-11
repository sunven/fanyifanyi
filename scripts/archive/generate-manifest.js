#!/usr/bin/env node

/**
 * Tauri 更新清单生成脚本
 * 
 * 此脚本用于生成符合 Tauri updater 格式的更新清单 JSON 文件
 * 包含版本信息、下载链接、签名和文件哈希
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 配置
const BUNDLE_DIR = path.join(__dirname, '..', 'src-tauri', 'target', 'release', 'bundle');
const OUTPUT_FILE = path.join(__dirname, '..', 'update-manifest.json');
const BASE_URL = process.env.UPDATE_BASE_URL || 'https://your-update-server.com/releases';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * 计算文件的 SHA-256 哈希值
 */
function calculateFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * 读取签名文件内容
 */
function readSignature(sigPath) {
  if (!fs.existsSync(sigPath)) {
    return null;
  }
  return fs.readFileSync(sigPath, 'utf8').trim();
}

/**
 * 获取文件大小（字节）
 */
function getFileSize(filePath) {
  const stats = fs.statSync(filePath);
  return stats.size;
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * 检测当前操作系统
 */
function detectOS() {
  const platform = process.platform;
  switch (platform) {
    case 'darwin': return 'macOS';
    case 'linux': return 'Linux';
    case 'win32': return 'Windows';
    default: return platform;
  }
}

/**
 * 查找构建产物
 */
function findBuildArtifacts(version) {
  const artifacts = {
    'darwin-x86_64': null,
    'darwin-aarch64': null,
    'linux-x86_64': null,
    'windows-x86_64': null,
  };

  // macOS
  const macosDir = path.join(BUNDLE_DIR, 'macos');
  if (fs.existsSync(macosDir)) {
    const tarGz = path.join(macosDir, 'fanyifanyi.app.tar.gz');
    if (fs.existsSync(tarGz)) {
      // Tauri 2.x 通常生成 universal binary
      artifacts['darwin-x86_64'] = tarGz;
      artifacts['darwin-aarch64'] = tarGz;
    }
  }

  // Linux
  const appimageDir = path.join(BUNDLE_DIR, 'appimage');
  if (fs.existsSync(appimageDir)) {
    const files = fs.readdirSync(appimageDir);
    
    // 查找 x86_64/amd64 AppImage
    const x64AppImage = files.find(f => 
      f.endsWith('.AppImage') && 
      (f.includes('amd64') || f.includes('x86_64'))
    );
    if (x64AppImage) {
      artifacts['linux-x86_64'] = path.join(appimageDir, x64AppImage);
    }
  }

  // Windows
  const msiDir = path.join(BUNDLE_DIR, 'msi');
  if (fs.existsSync(msiDir)) {
    const files = fs.readdirSync(msiDir);
    
    // 查找 x64 MSI
    const x64Msi = files.find(f => 
      f.endsWith('.msi') && 
      f.includes('x64')
    );
    if (x64Msi) {
      artifacts['windows-x86_64'] = path.join(msiDir, x64Msi);
    }
  }

  return artifacts;
}

/**
 * 生成平台信息
 */
function generatePlatformInfo(filePath, baseUrl) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  const fileName = path.basename(filePath);
  const sigPath = filePath + '.sig';
  const signature = readSignature(sigPath);

  if (!signature) {
    log(`  ⚠️  警告: 未找到签名文件 ${fileName}.sig`, 'yellow');
  }

  const hash = calculateFileHash(filePath);
  const size = getFileSize(filePath);

  return {
    signature: signature || '',
    url: `${baseUrl}/${fileName}`,
    hash: hash,
    size: size,
    sizeFormatted: formatFileSize(size),
  };
}

/**
 * 生成更新说明
 */
function generateReleaseNotes(version) {
  const notesPath = path.join(__dirname, '..', 'CHANGELOG.md');
  
  if (fs.existsSync(notesPath)) {
    try {
      const content = fs.readFileSync(notesPath, 'utf8');
      // 尝试提取当前版本的更新说明
      const versionRegex = new RegExp(`## \\[?${version}\\]?[\\s\\S]*?(?=## |$)`, 'i');
      const match = content.match(versionRegex);
      if (match) {
        return match[0].replace(/^## \[?.*?\]?\s*/, '').trim();
      }
    } catch (error) {
      log(`  ⚠️  读取 CHANGELOG.md 失败: ${error.message}`, 'yellow');
    }
  }

  return `fanyifanyi v${version} 更新\n\n请查看完整的更新日志了解详细信息。`;
}

/**
 * 主函数
 */
function main() {
  log('========================================', 'blue');
  log('Tauri 更新清单生成工具', 'blue');
  log('========================================', 'blue');
  console.log();

  // 读取版本号
  const packageJson = require('../package.json');
  const version = packageJson.version;

  log(`📦 应用版本: ${version}`, 'green');
  log(`🌐 基础 URL: ${BASE_URL}`, 'blue');
  log(`🖥️  当前系统: ${detectOS()}`, 'blue');
  console.log();

  // 检查构建目录
  if (!fs.existsSync(BUNDLE_DIR)) {
    log('❌ 错误: 找不到构建目录', 'red');
    log(`   路径: ${BUNDLE_DIR}`, 'yellow');
    log('\n请先运行构建脚本:', 'yellow');
    log('  ./scripts/build-release.sh', 'yellow');
    process.exit(1);
  }

  log('🔍 查找构建产物...', 'blue');
  const artifacts = findBuildArtifacts(version);

  // 生成平台信息
  const platforms = {};
  let foundArtifacts = 0;

  for (const [platform, filePath] of Object.entries(artifacts)) {
    if (filePath) {
      log(`  ✅ ${platform}: ${path.basename(filePath)}`, 'green');
      const platformInfo = generatePlatformInfo(filePath, BASE_URL);
      if (platformInfo) {
        platforms[platform] = platformInfo;
        foundArtifacts++;
      }
    } else {
      log(`  ⚠️  ${platform}: 未找到`, 'yellow');
    }
  }

  console.log();

  if (foundArtifacts === 0) {
    log('❌ 错误: 未找到任何构建产物', 'red');
    log('\n请确保已运行构建脚本并生成了更新包', 'yellow');
    process.exit(1);
  }

  log(`✅ 找到 ${foundArtifacts} 个平台的构建产物`, 'green');
  console.log();

  // 生成更新说明
  log('📝 生成更新说明...', 'blue');
  const notes = generateReleaseNotes(version);

  // 生成清单
  const manifest = {
    version: version,
    notes: notes,
    pub_date: new Date().toISOString(),
    platforms: {}
  };

  // 添加平台信息（只包含 Tauri 需要的字段）
  for (const [platform, info] of Object.entries(platforms)) {
    manifest.platforms[platform] = {
      signature: info.signature,
      url: info.url
    };
  }

  // 保存清单文件
  log('💾 保存更新清单...', 'blue');
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  log(`✅ 清单已保存到: ${OUTPUT_FILE}`, 'green');
  console.log();

  // 生成详细报告
  const reportFile = path.join(__dirname, '..', `update-manifest-${version}-report.json`);
  const detailedReport = {
    version: version,
    generated: new Date().toISOString(),
    baseUrl: BASE_URL,
    platforms: platforms,
    manifest: manifest
  };
  fs.writeFileSync(reportFile, JSON.stringify(detailedReport, null, 2) + '\n', 'utf8');
  log(`📊 详细报告已保存到: ${reportFile}`, 'green');
  console.log();

  // 显示清单内容
  log('========================================', 'blue');
  log('更新清单内容预览:', 'blue');
  log('========================================', 'blue');
  console.log(JSON.stringify(manifest, null, 2));
  console.log();

  // 显示文件信息
  log('========================================', 'blue');
  log('文件信息:', 'blue');
  log('========================================', 'blue');
  for (const [platform, info] of Object.entries(platforms)) {
    log(`\n${platform}:`, 'green');
    log(`  URL: ${info.url}`, 'blue');
    log(`  大小: ${info.sizeFormatted}`, 'blue');
    log(`  SHA-256: ${info.hash}`, 'blue');
    log(`  签名: ${info.signature ? '✅ 已签名' : '❌ 未签名'}`, info.signature ? 'green' : 'red');
  }
  console.log();

  // 下一步提示
  log('========================================', 'blue');
  log('📝 下一步操作:', 'blue');
  log('========================================', 'blue');
  console.log('1. 检查更新清单内容是否正确');
  console.log('2. 更新 BASE_URL 环境变量（如果需要）:');
  log('   UPDATE_BASE_URL=https://your-server.com/releases node scripts/generate-manifest.js', 'yellow');
  console.log('3. 上传构建产物到发布服务器');
  console.log('4. 上传更新清单到服务器的更新端点');
  console.log('5. 测试更新功能');
  console.log();
  log('✅ 清单生成完成！', 'green');
}

// 运行主函数
try {
  main();
} catch (error) {
  log(`\n❌ 错误: ${error.message}`, 'red');
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
}
