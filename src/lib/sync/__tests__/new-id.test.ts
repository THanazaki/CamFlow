import { afterEach, describe, expect, it, vi } from 'vitest'

import { newId, uuidV4FromRandomValues } from '@/lib/sync/mutations'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('newId', () => {
  it('randomUUID が使えればそれを使う', () => {
    expect(newId()).toMatch(UUID_V4)
  })

  it('randomUUID が無い環境（HTTP で開いたスマホなど）でも UUID v4 を作る', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })

    const ids = Array.from({ length: 200 }, () => newId())

    expect(ids.every((id) => UUID_V4.test(id))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('version と variant のビットを正しく立てる', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array) => array.fill(0xff),
    })

    expect(uuidV4FromRandomValues()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
  })
})
