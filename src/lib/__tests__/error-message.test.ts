import { describe, expect, it } from 'vitest'
import { getErrorMessage } from '../error-message'

describe('getErrorMessage', () => {
  it('keeps ordinary Error messages', () => {
    expect(getErrorMessage(new Error('认证失败'))).toBe('认证失败')
  })

  it('shows structured Supabase errors with code and details', () => {
    expect(getErrorMessage({
      code: '42703',
      message: 'column user_ai_configs.plaintext does not exist',
      details: 'schema cache is stale',
      hint: null,
    })).toBe('column user_ai_configs.plaintext does not exist：schema cache is stale（42703）')
  })

  it('falls back for unknown values', () => {
    expect(getErrorMessage({})).toBe('操作失败，请稍后重试')
  })
})
