/**
 * 版本工具函数
 * 用于语义化版本比较和格式化
 */

interface SemanticVersion {
  major: number
  minor: number
  patch: number
  prerelease?: string
  build?: string
}

/**
 * 解析语义化版本字符串
 * 支持格式: major.minor.patch[-prerelease][+build]
 * 例如: 1.2.3, 1.2.3-alpha.1, 1.2.3+20130313144700
 */
function parseVersion(version: string): SemanticVersion | null {
  // 移除可能的 'v' 前缀
  const cleanVersion = version.trim().replace(/^v/, '')

  // 正则表达式匹配语义化版本
  const regex = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9a-z-]+(?:\.[0-9a-z-]+)*))?(?:\+([0-9a-z-]+(?:\.[0-9a-z-]+)*))?$/i
  const match = cleanVersion.match(regex)

  if (!match) {
    return null
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4],
    build: match[5],
  }
}

/**
 * 比较两个版本号
 * @param v1 第一个版本号
 * @param v2 第二个版本号
 * @returns 如果 v1 > v2 返回 1, v1 < v2 返回 -1, v1 === v2 返回 0
 */
export function compareVersions(v1: string, v2: string): number {
  const version1 = parseVersion(v1)
  const version2 = parseVersion(v2)

  // 如果任一版本无法解析，按字符串比较
  if (!version1 || !version2) {
    if (v1 === v2)
      return 0
    return v1 > v2 ? 1 : -1
  }

  // 比较主版本号
  if (version1.major !== version2.major) {
    return version1.major > version2.major ? 1 : -1
  }

  // 比较次版本号
  if (version1.minor !== version2.minor) {
    return version1.minor > version2.minor ? 1 : -1
  }

  // 比较修订号
  if (version1.patch !== version2.patch) {
    return version1.patch > version2.patch ? 1 : -1
  }

  // 比较预发布版本
  // 根据语义化版本规范：
  // 1. 有预发布版本的版本号 < 没有预发布版本的版本号
  // 2. 预发布版本之间按字典序比较
  if (version1.prerelease && !version2.prerelease) {
    return -1
  }
  if (!version1.prerelease && version2.prerelease) {
    return 1
  }
  if (version1.prerelease && version2.prerelease) {
    return comparePrereleaseVersions(version1.prerelease, version2.prerelease)
  }

  // 版本号完全相同（构建号不影响版本优先级）
  return 0
}

/**
 * 比较预发布版本标识符
 */
function comparePrereleaseVersions(pre1: string, pre2: string): number {
  const parts1 = pre1.split('.')
  const parts2 = pre2.split('.')

  const maxLength = Math.max(parts1.length, parts2.length)

  for (let i = 0; i < maxLength; i++) {
    const part1 = parts1[i]
    const part2 = parts2[i]

    // 如果一个版本的部分更少，它的优先级更低
    if (part1 === undefined)
      return -1
    if (part2 === undefined)
      return 1

    // 尝试作为数字比较
    const num1 = Number.parseInt(part1, 10)
    const num2 = Number.parseInt(part2, 10)

    const isNum1 = !Number.isNaN(num1) && num1.toString() === part1
    const isNum2 = !Number.isNaN(num2) && num2.toString() === part2

    if (isNum1 && isNum2) {
      // 两者都是数字，数值比较
      if (num1 !== num2) {
        return num1 > num2 ? 1 : -1
      }
    }
    else if (isNum1) {
      // 数字标识符的优先级总是低于非数字标识符
      return -1
    }
    else if (isNum2) {
      return 1
    }
    else {
      // 两者都是字符串，字典序比较
      if (part1 !== part2) {
        return part1 > part2 ? 1 : -1
      }
    }
  }

  return 0
}

/**
 * 格式化版本号显示
 * @param version 版本号字符串
 * @param options 格式化选项
 * @param options.includePrefix 是否包含 'v' 前缀
 * @param options.includeBuild 是否包含构建号
 * @returns 格式化后的版本号
 */
export function formatVersion(
  version: string,
  options: {
    includePrefix?: boolean // 是否包含 'v' 前缀
    includeBuild?: boolean // 是否包含构建号
  } = {},
): string {
  const { includePrefix = false, includeBuild = false } = options

  const parsed = parseVersion(version)

  if (!parsed) {
    // 如果无法解析，返回原始版本号
    return version
  }

  let formatted = `${parsed.major}.${parsed.minor}.${parsed.patch}`

  if (parsed.prerelease) {
    formatted += `-${parsed.prerelease}`
  }

  if (includeBuild && parsed.build) {
    formatted += `+${parsed.build}`
  }

  if (includePrefix) {
    formatted = `v${formatted}`
  }

  return formatted
}

/**
 * 检查版本号是否有效
 * @param version 版本号字符串
 * @returns 是否为有效的语义化版本号
 */
export function isValidVersion(version: string): boolean {
  return parseVersion(version) !== null
}

/**
 * 检查版本 v1 是否比 v2 新
 * @param v1 第一个版本号
 * @param v2 第二个版本号
 * @returns v1 是否比 v2 新
 */
export function isNewerVersion(v1: string, v2: string): boolean {
  return compareVersions(v1, v2) > 0
}
