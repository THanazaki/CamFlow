import { describe, expect, it } from 'vitest'

import {
  DEMO_ACCOUNT_USER_ID,
  findLocalAccount,
  isLocalAccountId,
  isTestAccountLogin,
  TEST_ACCOUNT_ENABLED,
  TEST_ACCOUNT_USER_ID,
} from '@/lib/auth/test-account'

describe('テストアカウント', () => {
  it('既定では有効（本番を含む）', () => {
    expect(TEST_ACCOUNT_ENABLED).toBe(true)
  })

  it('test / test2026 だけを通す。アカウント名の大文字小文字と前後の空白は無視する', () => {
    expect(isTestAccountLogin('test', 'test2026')).toBe(true)
    expect(isTestAccountLogin(' TEST ', 'test2026')).toBe(true)
    expect(isTestAccountLogin('test', 'TEST2026')).toBe(false)
    expect(isTestAccountLogin('test', 'wrong')).toBe(false)
    expect(isTestAccountLogin('test@example.com', 'test2026')).toBe(false)
    expect(isTestAccountLogin(undefined, undefined)).toBe(false)
  })

  it('無効にしたら test / test2026 も通さない', () => {
    expect(isTestAccountLogin('test', 'test2026', false)).toBe(false)
  })

  it('show / show2026 はデモアカウント。test / test2026 とは別のユーザー', () => {
    expect(findLocalAccount(' Show ', 'show2026')).toEqual({ id: DEMO_ACCOUNT_USER_ID, email: 'show', demo: true })
    expect(findLocalAccount('test', 'test2026')).toEqual({ id: TEST_ACCOUNT_USER_ID, email: 'test', demo: false })
    expect(DEMO_ACCOUNT_USER_ID).not.toBe(TEST_ACCOUNT_USER_ID)
    expect(findLocalAccount('show', 'test2026')).toBeNull()
    expect(isTestAccountLogin('show', 'show2026')).toBe(false)
  })

  it('無効にしたら show / show2026 も通さない', () => {
    expect(findLocalAccount('show', 'show2026', false)).toBeNull()
  })
})

describe('isLocalAccountId', () => {
  it('テスト / デモアカウントの ID だけを端末の中だけのアカウントとみなす', () => {
    expect(isLocalAccountId(TEST_ACCOUNT_USER_ID)).toBe(true)
    expect(isLocalAccountId(DEMO_ACCOUNT_USER_ID)).toBe(true)
    expect(isLocalAccountId('11111111-1111-4111-8111-111111111111')).toBe(false)
    expect(isLocalAccountId(null)).toBe(false)
  })
})
