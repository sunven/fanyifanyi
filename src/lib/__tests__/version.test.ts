import { describe, expect, it } from 'vitest'
import { compareVersions, formatVersion, isNewerVersion, isValidVersion } from '../version'

describe('version utilities', () => {
  describe('compareVersions', () => {
    it('should return 0 for equal versions', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
      expect(compareVersions('2.5.3', '2.5.3')).toBe(0)
    })

    it('should return 1 when first version is greater', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1)
      expect(compareVersions('1.1.0', '1.0.0')).toBe(1)
      expect(compareVersions('1.0.1', '1.0.0')).toBe(1)
    })

    it('should return -1 when first version is less', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1)
      expect(compareVersions('1.0.0', '1.1.0')).toBe(-1)
      expect(compareVersions('1.0.0', '1.0.1')).toBe(-1)
    })

    it('should handle versions with v prefix', () => {
      expect(compareVersions('v1.0.0', '1.0.0')).toBe(0)
      expect(compareVersions('v2.0.0', 'v1.0.0')).toBe(1)
    })

    it('should handle prerelease versions correctly', () => {
      // Prerelease versions are less than release versions
      expect(compareVersions('1.0.0-alpha', '1.0.0')).toBe(-1)
      expect(compareVersions('1.0.0', '1.0.0-alpha')).toBe(1)

      // Compare prerelease versions
      expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1)
      expect(compareVersions('1.0.0-beta', '1.0.0-alpha')).toBe(1)
      expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.2')).toBe(-1)
    })

    it('should handle build metadata', () => {
      // Build metadata should not affect version precedence
      expect(compareVersions('1.0.0+20130313', '1.0.0+20130314')).toBe(0)
      expect(compareVersions('1.0.0+build1', '1.0.0+build2')).toBe(0)
    })

    it('should handle complex version strings', () => {
      expect(compareVersions('1.0.0-alpha.1+build.123', '1.0.0-alpha.1+build.456')).toBe(0)
      expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.2')).toBe(-1)
    })
  })

  describe('formatVersion', () => {
    it('should format basic versions', () => {
      expect(formatVersion('1.0.0')).toBe('1.0.0')
      expect(formatVersion('2.5.3')).toBe('2.5.3')
    })

    it('should add v prefix when requested', () => {
      expect(formatVersion('1.0.0', { includePrefix: true })).toBe('v1.0.0')
    })

    it('should handle prerelease versions', () => {
      expect(formatVersion('1.0.0-alpha')).toBe('1.0.0-alpha')
      expect(formatVersion('1.0.0-beta.1')).toBe('1.0.0-beta.1')
    })

    it('should include build metadata when requested', () => {
      expect(formatVersion('1.0.0+build123', { includeBuild: true })).toBe('1.0.0+build123')
      expect(formatVersion('1.0.0+build123', { includeBuild: false })).toBe('1.0.0')
    })

    it('should handle invalid versions gracefully', () => {
      expect(formatVersion('invalid')).toBe('invalid')
      expect(formatVersion('1.0')).toBe('1.0')
    })
  })

  describe('isValidVersion', () => {
    it('should validate correct semantic versions', () => {
      expect(isValidVersion('1.0.0')).toBe(true)
      expect(isValidVersion('0.0.1')).toBe(true)
      expect(isValidVersion('10.20.30')).toBe(true)
      expect(isValidVersion('v1.0.0')).toBe(true)
    })

    it('should validate versions with prerelease', () => {
      expect(isValidVersion('1.0.0-alpha')).toBe(true)
      expect(isValidVersion('1.0.0-beta.1')).toBe(true)
      expect(isValidVersion('1.0.0-rc.1.2.3')).toBe(true)
    })

    it('should validate versions with build metadata', () => {
      expect(isValidVersion('1.0.0+build123')).toBe(true)
      expect(isValidVersion('1.0.0-alpha+build')).toBe(true)
    })

    it('should reject invalid versions', () => {
      expect(isValidVersion('1.0')).toBe(false)
      expect(isValidVersion('1')).toBe(false)
      expect(isValidVersion('invalid')).toBe(false)
      expect(isValidVersion('1.0.0.0')).toBe(false)
    })
  })

  describe('isNewerVersion', () => {
    it('should return true when first version is newer', () => {
      expect(isNewerVersion('2.0.0', '1.0.0')).toBe(true)
      expect(isNewerVersion('1.1.0', '1.0.0')).toBe(true)
      expect(isNewerVersion('1.0.1', '1.0.0')).toBe(true)
    })

    it('should return false when first version is older or equal', () => {
      expect(isNewerVersion('1.0.0', '2.0.0')).toBe(false)
      expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false)
    })

    it('should handle prerelease versions', () => {
      expect(isNewerVersion('1.0.0', '1.0.0-alpha')).toBe(true)
      expect(isNewerVersion('1.0.0-beta', '1.0.0-alpha')).toBe(true)
    })
  })
})
