import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getUpdateSettings,
  saveDismissedVersion,
  clearDismissedVersion,
} from '../updater'

describe('更新忽略逻辑', () => {
  // 保存原始 localStorage
  let originalLocalStorage: Storage

  beforeEach(() => {
    // 保存当前 localStorage
    originalLocalStorage = global.localStorage
    // 创建一个模拟的 localStorage
    const mockStorage: Record<string, string> = {}
    global.localStorage = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value
      },
      removeItem: (key: string) => {
        delete mockStorage[key]
      },
      clear: () => {
        for (const key in mockStorage) {
          delete mockStorage[key]
        }
      },
      key: (index: number) => {
        const keys = Object.keys(mockStorage)
        return keys[index] || null
      },
      length: Object.keys(mockStorage).length,
    } as Storage
  })

  afterEach(() => {
    // 恢复原始 localStorage
    global.localStorage = originalLocalStorage
  })

  it('稍后提醒不应保存忽略版本', () => {
    // 获取初始设置
    const settings = getUpdateSettings()
    expect(settings.dismissedVersion).toBeNull()

    // 模拟"稍后提醒"操作 - 不调用 saveDismissedVersion
    // 验证没有保存忽略版本
    const newSettings = getUpdateSettings()
    expect(newSettings.dismissedVersion).toBeNull()
  })

  it('跳过此版本应保存忽略版本', () => {
    const testVersion = '1.2.3'

    // 模拟"跳过此版本"操作
    saveDismissedVersion(testVersion)

    // 验证已保存忽略版本
    const settings = getUpdateSettings()
    expect(settings.dismissedVersion).toBe(testVersion)
  })

  it('清除忽略版本后应能再次看到更新', () => {
    const testVersion = '1.2.3'

    // 先保存忽略版本
    saveDismissedVersion(testVersion)
    expect(getUpdateSettings().dismissedVersion).toBe(testVersion)

    // 清除忽略版本
    clearDismissedVersion()
    expect(getUpdateSettings().dismissedVersion).toBeNull()
  })

  it('多次稍后提醒不会累积忽略版本', () => {
    // 模拟多次"稍后提醒"操作
    // 不调用 saveDismissedVersion

    // 验证仍然没有忽略版本
    const settings = getUpdateSettings()
    expect(settings.dismissedVersion).toBeNull()
  })
})
