#!/usr/bin/env node

/**
 * 自动将生成的公钥更新到 tauri.conf.json
 */

const fs = require('node:fs')
const path = require('node:path')

const PUBKEY_PATH = path.join(__dirname, '..', '.tauri', 'fanyifanyi.key.pub')
const CONFIG_PATH = path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json')

console.log('========================================')
console.log('更新 Tauri 配置中的公钥')
console.log('========================================\n')

// 检查公钥文件是否存在
if (!fs.existsSync(PUBKEY_PATH)) {
  console.error('❌ 错误: 找不到公钥文件')
  console.error(`   路径: ${PUBKEY_PATH}`)
  console.error('\n请先运行 scripts/setup-signing.sh 生成密钥对')
  process.exit(1)
}

// 读取公钥
let pubkey
try {
  pubkey = fs.readFileSync(PUBKEY_PATH, 'utf8').trim()
  console.log('✅ 成功读取公钥')
  console.log(`   长度: ${pubkey.length} 字符\n`)
}
catch (error) {
  console.error('❌ 读取公钥失败:', error.message)
  process.exit(1)
}

// 读取 tauri.conf.json
let config
try {
  const configContent = fs.readFileSync(CONFIG_PATH, 'utf8')
  config = JSON.parse(configContent)
  console.log('✅ 成功读取 tauri.conf.json\n')
}
catch (error) {
  console.error('❌ 读取配置文件失败:', error.message)
  process.exit(1)
}

// 更新公钥
if (!config.bundle) {
  config.bundle = {}
}
if (!config.bundle.updater) {
  config.bundle.updater = {
    active: true,
    endpoints: [],
  }
}

const oldPubkey = config.bundle.updater.pubkey
config.bundle.updater.pubkey = pubkey

// 写回配置文件
try {
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  console.log('✅ 成功更新 tauri.conf.json')

  if (oldPubkey && oldPubkey !== 'YOUR_PUBLIC_KEY_HERE') {
    console.log('\n⚠️  注意: 已替换旧的公钥')
    console.log(`   旧公钥: ${oldPubkey.substring(0, 40)}...`)
  }

  console.log(`   新公钥: ${pubkey.substring(0, 40)}...`)
  console.log('\n✅ 配置更新完成！')
}
catch (error) {
  console.error('❌ 写入配置文件失败:', error.message)
  process.exit(1)
}
