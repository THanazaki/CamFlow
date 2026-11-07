import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { SYNC_TABLES } from '@/lib/db/types'
import { loadWishlist } from '@/lib/queries/wishlist'
import { createRow, softDeleteRow } from '@/lib/sync/mutations'

import { createWishlistModel, type WishlistInput } from '../wishlist'

const USER = '11111111-1111-4111-8111-111111111111'

function input(overrides: Partial<WishlistInput> = {}): WishlistInput {
  return {
    modelName: '栞奈',
    eventName: '',
    modelX: '',
    modelInstagram: '',
    costumeOptions: '',
    shootingMethodOptions: '',
    ...overrides,
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('撮影希望モデル登録', () => {
  it('FK の親であるモデルより後に同期する', () => {
    expect(SYNC_TABLES.indexOf('wishlist_models')).toBeGreaterThan(SYNC_TABLES.indexOf('models'))
  })

  it('入力内容を保存し、一覧に出す', async () => {
    await createWishlistModel(
      USER,
      input({
        modelName: ' 栞奈 ',
        eventName: ' 秋の撮影会 ',
        modelX: ' @kanna ',
        modelInstagram: ' @kanna_ig ',
        costumeOptions: ' 浴衣 ',
        shootingMethodOptions: ' 動画撮影 ',
      }),
    )

    const [model] = await db.models.toArray()
    expect(model).toMatchObject({ name: '栞奈', sns_links: { x: '@kanna', instagram: '@kanna_ig' } })
    expect(await loadWishlist()).toMatchObject([
      {
        modelName: '栞奈',
        x: '@kanna',
        instagram: '@kanna_ig',
        eventName: '秋の撮影会',
        costumeOptions: '浴衣',
        shootingMethodOptions: '動画撮影',
      },
    ])
  })

  it('モデル名以外は未入力でも登録でき、null で持つ', async () => {
    const id = await createWishlistModel(USER, input({ costumeOptions: '   ' }))

    expect(await db.wishlist_models.get(id)).toMatchObject({
      event_name: null,
      costume_options: null,
      shooting_method_options: null,
    })
    const [model] = await db.models.toArray()
    expect(model.sns_links).toEqual({})
  })

  it('モデル名が空ならエラーにして何も作らない', async () => {
    await expect(createWishlistModel(USER, input({ modelName: '   ' }))).rejects.toThrow(
      'モデル名を入力してください',
    )

    expect(await db.models.count()).toBe(0)
    expect(await db.wishlist_models.count()).toBe(0)
  })

  it('既存のモデルは新しく作らず、大文字小文字の違いも同じモデルとして扱う', async () => {
    await createRow('models', { user_id: USER, name: 'Kanna', sns_links: {} })

    await createWishlistModel(USER, input({ modelName: 'kanna' }))

    expect(await db.models.count()).toBe(1)
    expect((await loadWishlist())[0].modelName).toBe('Kanna')
  })

  it('入力があったアカウントだけ上書きし、空欄では既存のアカウントを消さない', async () => {
    await createRow('models', {
      user_id: USER,
      name: '栞奈',
      sns_links: { x: '@old', instagram: '@old_ig', tiktok: '@tt' },
    })

    await createWishlistModel(USER, input({ modelX: '@new' }))

    const [model] = await db.models.toArray()
    expect(model.sns_links).toEqual({ x: '@new', instagram: '@old_ig', tiktok: '@tt' })
  })

  it('アカウントに変更が無ければモデルを更新しない', async () => {
    await createRow('models', { user_id: USER, name: '栞奈', sns_links: { x: '@same' } })
    const outboxBefore = await db._outbox.count()

    await createWishlistModel(USER, input({ modelX: '@same' }))

    // 増えるのは撮影希望の insert の1件だけ
    expect(await db._outbox.count()).toBe(outboxBefore + 1)
  })

  it('同じモデルを複数登録でき、新しい順に並ぶ', async () => {
    const first = await createWishlistModel(USER, input({ eventName: '春' }))
    const second = await createWishlistModel(USER, input({ eventName: '秋' }))
    await db.wishlist_models.update(first, { created_at: '2026-01-01T00:00:00.000Z' })
    await db.wishlist_models.update(second, { created_at: '2026-02-01T00:00:00.000Z' })

    expect((await loadWishlist()).map((r) => r.eventName)).toEqual(['秋', '春'])
    expect(await db.models.count()).toBe(1)
  })

  it('マスタから削除したモデルは一覧に出さない', async () => {
    await createWishlistModel(USER, input())
    const [model] = await db.models.toArray()
    await softDeleteRow('models', model.id)

    expect(await loadWishlist()).toEqual([])
  })

  it('撮影希望の登録を送信キューに積む', async () => {
    const id = await createWishlistModel(USER, input())

    const entries = await db._outbox.toArray()
    expect(entries.some((e) => e.table === 'wishlist_models' && e.row_id === id)).toBe(true)
  })

  it('撮影希望で入れたアカウントが保存先のモデルに残り、続けて登録しても消えない', async () => {
    await createWishlistModel(USER, input({ modelX: '@kanna' }))
    await createWishlistModel(USER, input({ eventName: '二回目' }))

    const rows = await loadWishlist()
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.x === '@kanna')).toBe(true)
  })
})
