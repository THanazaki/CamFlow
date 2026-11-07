import { describe, expect, it } from 'vitest'

import { isTestAccountLogin, TEST_ACCOUNT_ENABLED } from '@/lib/auth/test-account'

describe('テストアカウント', () => {
  it('既定では有効（本番を含む）', () => {
    expect(TEST_ACCOUNT_ENABLED).toBe(true)
  })

  it('test / test だけを通す。アカウント名の大文字小文字と前後の空白は無視する', () => {
    expect(isTestAccountLogin('test', 'test')).toBe(true)
    expect(isTestAccountLogin(' TEST ', 'test')).toBe(true)
    expect(isTestAccountLogin('test', 'TEST')).toBe(false)
    expect(isTestAccountLogin('test', 'wrong')).toBe(false)
    expect(isTestAccountLogin('test@example.com', 'test')).toBe(false)
    expect(isTestAccountLogin(undefined, undefined)).toBe(false)
  })

  it('無効にしたら test / test も通さない', () => {
    expect(isTestAccountLogin('test', 'test', false)).toBe(false)
  })
})
